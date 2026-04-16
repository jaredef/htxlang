# htxlang Reference Profile

**Version 0.1**
**Jared Foy**
**April 2026**

**Companion to:** htxlang Specification v0.2

---

## Status

Working draft. This document formalizes the implementation opinions of the reference htxlang engine. Conformant engines that follow these opinions achieve interoperability with the reference implementation.

All recommendations in this document use SHOULD per RFC 2119. They are not required for specification conformance. They are required for reference profile conformance.

## 1. Purpose

The htxlang specification defines contracts and mechanics. This document defines the recommended choices for realizing those mechanics in a concrete engine. It bridges the abstract specification to a concrete syntax, pipeline, and runtime.

---

## 2. Server Namespace

**Opinion:** The server namespace prefix SHOULD be `htx:`.

Server directives SHOULD use XML-style prefixed element names:
```html
<htx:data type="post" as="posts" />
<htx:if test="posts">...</htx:if>
<htx:v>post.title</htx:v>
```

**Rationale:** The `htx:` prefix is concise, visually distinct from HTML, and cannot collide with current or future HTML element names (which do not contain colons).

---

## 3. File Format

**Opinion:** Source representations SHOULD use the `.htx` file extension.

**Opinion:** Source files SHOULD be UTF-8 encoded.

**Opinion:** File-based routing SHOULD map the filesystem path to the URL path:
- `templates/index.htx` → `/`
- `templates/blog.htx` → `/blog`
- `templates/blog/[slug].htx` → `/blog/:slug`

Dynamic segments SHOULD be denoted with square brackets: `[paramName]`.

---

## 4. Directive Reference

### 4.1 Expression Output

```html
<!-- Text content (HTML-escaped) -->
<htx:v>path.to.value</htx:v>

<!-- Text content with pipe -->
<htx:v>path.to.value | uppercase</htx:v>

<!-- Unescaped HTML output -->
<htx:v raw>path.to.html</htx:v>

<!-- Self-closing form -->
<htx:v path="field.name" />

<!-- Attribute binding -->
<a href="/blog/{htx:post.slug}">Link</a>
```

**Rationale:** `htx:v` is a short, readable tag for value output. The `{htx:...}` attribute syntax uses the namespace prefix inside braces to maintain the bilateral boundary within attributes.

### 4.2 Data Declaration

```html
<!-- Multi-record query -->
<htx:data type="post" where="status = 'published'" order="created_at desc" limit="10" as="posts" />

<!-- Single-record lookup -->
<htx:data type="post" slug="{route.slug}" as="post" />
```

**Attributes:**
| Attribute | Purpose |
|-----------|---------|
| type | Resource type (table name, collection) |
| where | Filter expression |
| order | Sort expression |
| limit | Maximum records |
| offset | Skip records |
| slug | Unique identifier for single-record lookup |
| as | Variable name in data context |

### 4.3 Control Flow

```html
<!-- Iteration -->
<htx:each items="posts" as="post">
  <article><htx:v>post.title</htx:v></article>
  <htx:empty>
  <p>No posts.</p>
</htx:each>

<!-- Conditionals -->
<htx:if test="user">
  <p>Welcome, <htx:v>user.name</htx:v></p>
</htx:if>
<htx:else>
  <p>Please sign in.</p>
</htx:else>
```

**Iteration variables:** `$index` (zero-based), `$first` (boolean), `$last` (boolean).

### 4.4 Composition

```html
<!-- Include -->
<htx:include src="/partials/_nav.htx" />

<!-- Component -->
<htx:component src="components/card.htx" title="Hello">
  <p>Slot content.</p>
</htx:component>
```

**Component definition:**
```html
<htx:props>
title = "Default Title"
variant = "default"
</htx:props>
<div class="card">
  <h3>{{ title }}</h3>
  <htx:slot />
</div>
```

**Note:** Inside component definitions, `{{ propName }}` is the prop substitution syntax. This is distinct from the expression syntax (`htx:v`) and operates at the composition stage before expression evaluation.

### 4.5 Variables

```html
<htx:let greeting="Hello World" />
<htx:let fullName="{route.firstName} {route.lastName}" />
```

### 4.6 Grants

```html
<!-- WebSocket credential -->
<htx:grant type="websocket" as="ws" />

<!-- Channel credential -->
<htx:grant type="channel" module="trading-dashboard" as="channel" />

<!-- Signed asset URL -->
<htx:grant type="asset" path="/uploads/private/report.pdf" as="report" />
```

### 4.7 Mutations

```html
<htx:action name="create" type="post" />
<htx:action name="update" type="post" record="{htx:post.id}" />
<htx:action name="delete" type="post" record="{htx:post.id}" />
```

Token available via `{htx:$actions.create}`, `{htx:$actions.update}`, etc.

### 4.8 Authentication Conditionals

```html
<htx:auth>Visible when authenticated.</htx:auth>
<htx:unauth>Visible when not authenticated.</htx:unauth>
<htx:auth role="admin">Visible to admins only.</htx:auth>
```

### 4.9 Layout

```html
<!-- Explicit layout -->
<htx:layout src="layouts/fullscreen.htx" />

<!-- No layout -->
<htx:layout none />
```

Convention: `_layout.htx` files discovered by walking up the directory tree.

### 4.10 Server-Mediated Scripts

```html
<!-- Page-level: expressions evaluated, no element binding -->
<htx:script>
  var token = '<htx:v>ws.token</htx:v>';
  console.log('Server-resolved:', token);
</htx:script>

<!-- Component-level: expressions evaluated, el binding provided -->
<htx:script>
  el.querySelector('.count').textContent = '{{ initial }}';
</htx:script>
```

### 4.11 Literal Blocks

```html
<htx:raw>
  Content here is not processed.
  <htx:v>this.is.literal</htx:v>
</htx:raw>
```

---

## 5. Resolution Pipeline

The reference profile defines a 22-stage pipeline. Implementations following this profile SHOULD process stages in this order:

| Stage | Description |
|-------|-------------|
| 1 | Static file serving |
| 2 | Channel API routing and token validation |
| 3 | Middleware chain execution |
| 4 | Context provider resolution |
| 5 | Pre-layout template processors |
| 6 | Include expansion |
| 7 | Component resolution + script extraction |
| 8 | Page-level htx:script extraction |
| 9 | htx:let variable binding |
| 10 | htx:data resolution |
| 11 | htx:grant credential materialization |
| 12 | htx:action mutation token preparation |
| 13 | htx:auth / htx:unauth conditional rendering |
| 14 | htx:each / htx:if control flow |
| 15 | htx:v expression evaluation |
| 16 | Directive stripping |
| 17 | Post-layout template processors |
| 18 | Layout wrapping |
| 19 | Post-layout include + auth + control flow pass |
| 20 | Script injection (via comment placeholders) |
| 21 | Final expression evaluation pass |
| 22 | Script placeholder replacement + htx:raw finalization |

---

## 6. Token Format

### 6.1 Action Tokens

**Format:** `{base64url(payload)}.{base64url(signature)}`

**Payload (JSON):**
```json
{
  "action": "create",
  "type": "post",
  "recordId": null,
  "exp": 1775300000000
}
```

**Signing:** HMAC-SHA256 with server secret.

### 6.2 Channel Tokens

**Format:** `{base64url(payload)}.{base64url(signature)}`

**Payload (JSON):**
```json
{
  "sub": "user-id",
  "scope": "channel:module-name",
  "exp": 1775300000000,
  "jti": "unique-token-id"
}
```

**Signing:** HMAC-SHA256 with server secret.
**Default TTL:** 120 seconds.

### 6.3 Signed URLs

**Format:** `{path}?sig={base64url(signature)}&exp={timestamp}`

**Signed payload:** `{path}:{expiry_timestamp}`

**Signing:** HMAC-SHA256 with server secret.
**Default TTL:** 1 hour.

---

## 7. Pipe Functions

| Pipe | Behavior |
|------|----------|
| uppercase | Convert to uppercase |
| lowercase | Convert to lowercase |
| capitalize | Uppercase first character |
| trim | Remove leading/trailing whitespace |
| length | Array length or string length |
| json | JSON.stringify the value |
| raw | Return value without HTML escaping |

---

## 8. Compilation

### 8.1 Topology Sources

| Extension | Compiler | Notes |
|-----------|----------|-------|
| .js | None (pass-through) | Plain JavaScript |
| .ts | TypeScript transpiler (target: browser) | Strip types |
| .tsx | TypeScript transpiler with JSX pragma | `/** @jsxRuntime classic */ /** @jsx h */` prepended |

### 8.2 JSX Transform

TSX files SHOULD have the classic JSX runtime pragma prepended before compilation. The JSX factory function SHOULD be `h` (the DOM helper from the client library).

### 8.3 Tailwind CSS

If Tailwind CSS is used, the engine SHOULD generate the CSS at boot time by scanning topology source files and the component library for utility classes. The CSS SHOULD be regenerated when topology files change during development (HMR).

---

## 9. Client Libraries

The reference profile includes the following client-side libraries:

| Library | Purpose | Size |
|---------|---------|------|
| htx-ui.js | DOM helper: h(), render() | ~3 KB min |
| htx-store.js | TopologyStore + MapStore | ~3 KB min |
| presto-signal.js | signal(), computed(), effect(), batch() | ~3 KB min |
| presto-ui.js | 29 shadcn-compatible Tailwind components | ~8 KB min |
| presto-hooks.js | createComponent, useState, useStore, useEffect | ~3 KB min |

Total: approximately 20 KB minified.

These libraries are not part of the specification. They are part of the reference profile. Alternative client libraries satisfying the same patterns are permitted.

---

## 10. Layout Convention

**Layout file name:** `_layout.htx`

**Content placeholder:** `__content__`

**Walk direction:** from template directory upward to template root.

**Stop condition:** layout file contains `<!DOCTYPE html>` (case-insensitive).

**Fragment detection:** presence of `HX-Request` header.

---

## 11. Channel Endpoint

**Base path:** `/api/channel`

**Full pattern:** `/api/channel/{moduleName}/{subPath}`

**Authentication header:** `Authorization: Bearer {token}`

---

## 12. Conformance

An engine is **reference profile conformant** if it:

1. Satisfies all MUST requirements in the htxlang specification.
2. Implements the directives listed in §4 with the specified names and attributes.
3. Processes the resolution pipeline in the order specified in §5.
4. Uses the token formats specified in §6.
5. Supports the pipe functions listed in §7.

Reference profile conformance implies specification conformance. Specification conformance does not imply reference profile conformance.
