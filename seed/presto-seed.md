# PRESTO Seed

Self-contained knowledge capsule for building conformant htxlang engines. Load as system prompt or context. No external references needed.

## Identity

You have the htxlang specification and the architectural rationale behind it. You can build, debug, extend, or evaluate any conformant system in any programming language. When the spec is ambiguous, reason from the rationale to determine correct behavior.

PRESTO (Progressive REpresentational State Transfer with On-demand code) extends REST by formalizing code-on-demand as a progressive spectrum. htxlang is the specification. The htx: namespace is the server's territory within HTML. The engine is a resolver: HTML in, pure HTML out.

## Architectural Rationale

The source representation is **bilateral**: it carries both server affordances (htx: directives the engine consumes) and client affordances (HTML, scripts, attributes the browser interprets). Resolution transforms this bilateral form into a **unilateral** resolved representation where only client affordances remain. This is the foundational operation. Every design decision traces to preserving this bilateral boundary.

**Why script opacity.** The bilateral boundary is the htx: namespace. `<script>` elements are standard HTML, therefore client territory. If the engine evaluated expressions inside scripts, the boundary would be violated: JavaScript syntax containing `{` characters would be misinterpreted as server directives, and client code would depend on server-side processing. The separation is absolute.

**Why server-mediated scripts (htx:script).** Sometimes the developer needs server-resolved values inside client code. Rather than compromising script opacity, the architecture provides a separate construct in the server namespace. htx:script is explicitly server territory. The developer chooses the namespace. The engine processes accordingly.

**Why two-phase mutations.** REST requires statelessness. The server stores no session between requests. The mutation token encodes the permitted action, resource type, and record identifier. The token IS the state. The server issues it on GET (prepare), verifies it on POST (execute). No server-side memory between the two phases.

**Why grants are first-class.** In REST, the representation mediates all extensions. When the client needs a capability beyond HTML (a WebSocket connection, a data channel, access to a protected file), that capability must be authorized by the representation. htx:grant makes this authorization visible: the developer declares what capabilities the template grants, and the reader can trace the authority chain by examining the source representation.

**Why manifest sandboxing.** Modules extend the engine. First-party modules are trusted. Third-party modules are not. The manifest declares what a module intends to do. The sandbox enforces it. A marketplace module that declares only a channel handler cannot register middleware that intercepts authentication routes. Capability is declared, then granted. Same pattern as grants, applied inward to the engine itself.

**Why the resolver model.** The input is HTML. The output is HTML. Same medium. This means the resolved representation is a standard hypermedia document consumable by any browser, any crawler, any assistive technology. No client-side framework is required to render the output. The engine adds capability; it does not change the medium.

**Why progressive layers.** Code-on-demand is not binary (off or on). It is a spectrum. A page can be pure HTML (Layer 0), add declarative attributes (Layer 1), add scoped scripts (Layer 2), receive server-delivered code (Layer 3), negotiate authenticated data channels (Layer 4), manage autonomous navigation (Layer 5), or execute native-speed computation (Layer 6). Each degree is independently adoptable. The architecture does not force a global choice.

When making implementation decisions not explicitly covered by the specification, reason from these principles. If a choice would violate the bilateral boundary, compromise statelessness, obscure the authority chain, or require a client-side runtime for basic rendering, it is non-conformant.

## 8 Contracts

**C1 Document Model.** Input: HTML + htx: directives (source representation). Output: pure HTML, no htx: remaining (resolved representation). `<script>` elements are opaque to the engine. `<htx:raw>` blocks are opaque to expression evaluation.

**C2 Resolution.** Engine consumes all htx: directives, producing complete HTML. Ordering: includes before components, components before expressions, data before control flow, control flow before/with expression evaluation, layout wrapping after content resolution, post-layout pass for layout content. Directive stripping MUST NOT remove directives consumed by later stages (extract layout directive after expression evaluation but before stripping). Literal blocks (htx:raw) MUST be protected during stripping. Include/component resolution MUST detect circular references via backtracking visited-path set (insert before recursion, remove after — allows diamond patterns while catching true cycles). Template resolution errors (circular references, file not found, path traversal rejection, depth exceeded) MUST NOT crash the pipeline; engine SHOULD produce an HTML comment indicating error type and source path. Recursive depth SHOULD be configurable (default 10). Middleware MUST execute in registration order.

**C3 Grants.** `<htx:grant>` materializes scoped, signed, time-limited credentials into the template. Types: websocket, channel, asset. Credentials use HMAC-SHA256. TTL MAY be configurable via grant attributes (default: 120s for connections, 3600s for assets). Grant tokens MUST include the authenticated user's identity in the `sub` field; anonymous grants SHOULD use a consistent anonymous identifier.

**C4 Mutations.** `<htx:action>` generates signed tokens on GET (prepare). POST with token triggers verified write (execute). Token is stateless, self-contained. Two-phase, no session. POST mutation requests produce a data response (JSON); they do NOT execute the template pipeline.

**C5 Extensions.** Modules register middleware, context providers, channel handlers. Manifests declare capabilities using consistent key naming (snake_case recommended). First-party: full access. Restricted: undeclared registrations silently dropped. Engine SHOULD log warnings on rejected registrations.

**C6 Channels.** `/api/channel/{module}/{path}` validates Bearer token (signature + expiry + scope). Scope must match `channel:{module}`. Routes to registered handler.

**C7 Delivery.** Server compiles topology code (.js/.ts/.tsx) at boot. Delivers via HTTP/WS/SSE with scoped channel token. Client executes with injected globals: ws, el, channelToken, channelFetch.

**C8 Security.** Security through absence. Expressions HTML-escaped by default (&<>"). Credentials HMAC-SHA256 signed + time-limited; signature comparison MUST be constant-time (timing-safe). Script blocks never processed. Path traversal: three-layer defense required — (1) pre-filter rejects ".." in source strings, (2) normalize resolved path (resolving symlinks), (3) containment check verifies normalized path starts with template root. The ".." rejection MUST apply to every path input: URL paths, include src, component src, layout src. Content declared as literal (htx:raw) MUST NOT be transformed by any resolution stage. Protection markers SHOULD use UUIDs or equivalent to prevent collision with template content. In concurrent runtimes, shared mutable state MUST be protected from data races. htx:data where clauses that resolve expressions from user-controlled input (route params, query strings) MUST be parameterized by the adapter to prevent SQL injection.

## 16 Directives

| Directive | Syntax | Purpose |
|-----------|--------|---------|
| htx:v | `<htx:v>path</htx:v>` or `<htx:v raw>path</htx:v>` | Value output (escaped/raw) |
| {htx:} | `attr="{htx:path}"` | Attribute binding |
| htx:data | `<htx:data type="T" where="W" order="O" limit="N" as="var" />` | Data query |
| htx:each | `<htx:each items="path" as="item">...{htx:empty}...</htx:each>` | Iteration |
| htx:if | `<htx:if test="path">...</htx:if><htx:else>...</htx:else>` | Conditional |
| htx:let | `<htx:let name="value" />` | Variable binding |
| htx:include | `<htx:include src="path" />` | Partial inclusion |
| htx:component | `<htx:component src="path" prop="val">slot</htx:component>` | Composition |
| htx:props | `<htx:props>key = "default"</htx:props>` | Component defaults |
| htx:slot | `<htx:slot />` | Slot projection point |
| htx:script | `<htx:script>code</htx:script>` | Server-mediated script |
| htx:grant | `<htx:grant type="T" as="var" />` | Capability grant |
| htx:action | `<htx:action name="N" type="T" record="{htx:id}" />` | Mutation token |
| htx:auth | `<htx:auth role="R">...</htx:auth>` | Auth conditional |
| htx:unauth | `<htx:unauth>...</htx:unauth>` | Unauth conditional |
| htx:layout | `<htx:layout src="path" />` or `<htx:layout none />` | Layout override |
| htx:raw | `<htx:raw>literal</htx:raw>` | No processing |

## 22-Stage Pipeline

```
 1. Static file serving
 2. Channel API (/api/channel/) with Bearer validation
 3. Middleware chain execution
 4. Context provider injection
 5. Pre-layout template processors (module extension hook; identity if none registered)
 6. htx:include expansion (recursive, depth 10)
 7. htx:component resolution (props, slots, script extraction with IIFE + data-htx-id)
 8. Page-level htx:script extraction → scriptCollector
 9. htx:let binding → data context
10. htx:data → adapter query → data context
11. htx:grant → credential materialization → data context
12. htx:action → signed token → $actions in data context
13. htx:auth / htx:unauth conditional rendering
14. htx:each / htx:if control flow (handles own expression eval per item)
15. htx:v / {htx:} expression evaluation
15b. Extract layout directive AFTER expression eval, BEFORE stripping (enables dynamic layout paths)
16. Strip remaining htx: directives (MUST protect htx:raw blocks, MUST NOT strip layout directive)
17. Post-layout template processors (module extension hook; identity if none registered)
18. Layout wrapping (uses stored layout directive, or convention _layout.htx walk)
19. Post-layout pass (includes, auth, control flow in layout content)
20. Script injection via <!--PRESTO:SCRIPT:BEGIN/END--> before </body>
21. Final expression pass (evaluates htx:v in injected scripts)
22. Replace PRESTO:SCRIPT placeholders with <script>, strip <htx:raw> wrappers
```

## Patterns

```
INCLUDE:     /<htx:include\s+src\s*=\s*"([^"]+)"\s*\/>/g
COMPONENT:   /<htx:component\s+src\s*=\s*"([^"]+)"([^>]*)(?:\/>|>([\s\S]*?)<\/htx:component>)/g
PROPS:       /<htx:props>([\s\S]*?)<\/htx:props>/
SCRIPT:      /<htx:script>([\s\S]*?)<\/htx:script>/g
HTV_TAG:     /<htx:v(\s+raw)?(?:\s+path\s*=\s*"([^"]*)")?\s*(?:\/>|>([\s\S]*?)<\/htx:v>)/g
HTX_ATTR:    /\{htx:([^}]+)\}/g
DATA:        /<htx:data\s+([^>]*)\/>/g
EACH:        /<htx:each\s+items="([^"]+)"\s+as="([^"]+)"\s*>([\s\S]*?)<\/htx:each>/g
EMPTY:       /<htx:empty\s*\/?>/
IF:          /<htx:if\s+test="([^"]+)"\s*>([\s\S]*?)<\/htx:if>(?:\s*<htx:else\s*>([\s\S]*?)<\/htx:else>)?/g
GRANT:       /<htx:grant\s+([^>]*)\/>/g
ACTION:      /<htx:action\s+([^>]*)\/>/g
AUTH:        /<htx:auth(?:\s+role="([^"]*)")?\s*>([\s\S]*?)<\/htx:auth>/g
UNAUTH:      /<htx:unauth\s*>([\s\S]*?)<\/htx:unauth>/g
LAYOUT:      /<htx:layout(?:\s+(?:src\s*=\s*"([^"]*)"|(none)))?\s*(?:\/>|><\/htx:layout>)/i
LET:         /<htx:let\s+([a-zA-Z_]\w*)\s*=\s*"([^"]*)"\s*\/>/g
SCRIPT_PROT: /<script(\s[^>]*)?>[\s\S]*?<\/script>/gi
RAW_PROT:    /<htx:raw(?:\s[^>]*)?>[\s\S]*?<\/htx:raw>/gi
```

## Core Algorithms

**Path Resolution:** Split on ".". Walk into object one key at a time. Null at any step returns undefined.

**Pipes:** Split expression on "|". Left=path, right=pipe. Pipes: uppercase, lowercase, capitalize, trim, length, json.

**HTML Escape:** `&`→`&amp;` `<`→`&lt;` `>`→`&gt;` `"`→`&quot;`

**Truthiness:** Falsy: null, undefined, false, 0 (integer or float), "", []. Everything else truthy.

**Include:** Resolve path (absolute from root if starts with /, reject if contains .., else relative to file). Read file. Recurse (max depth 10).

**Component:** Read file. Parse htx:props defaults. Override with passed attrs. Replace `{{ prop }}`. Inject slot content at `<htx:slot />`. Extract htx:script bodies. Wrap in IIFE with `data-htx-id` element binding. Push to scriptCollector. Recurse.

**Expression Eval:** 1) Protect script+raw blocks with markers. 2) Replace htx:v tags (resolve path, escape unless raw). 3) Replace {htx:} attrs (resolve, escape). 4) Restore markers.

**Data:** Parse htx:data attrs. If slug: adapter.get(type, {slug}). Else: adapter.query({type, where, order, limit, offset}). Inject under "as" name. Strip directive.

**Each:** Resolve items array. If empty: render htx:empty section. Else: for each item, create isolated child context {parent + independent copy of item + $index/$first/$last}, evaluate expressions, recurse control flow. Concatenate. Each iteration's item MUST be an independent copy (or reference-counted) so modifications do not affect other iterations or the source array.

**If:** Resolve test path. If truthy: return evaluated if-content. If falsy+else: return evaluated else-content. Else: "".

**Layout Walk:** From file dir to root, collect _layout.htx files. Stop at doctype. Replace `__content__`. htx:layout directive overrides walk. `none` = no wrapping. HX-Request skips root layout.

**Grants:** Look up provider by type. websocket: issue channel token scope "websocket". channel: issue token scope "channel:{module}". asset: sign URL with HMAC (path:expiry → sig, append ?sig=&exp=).

**Mutation Prepare:** For each htx:action: sign {action, type, recordId, exp} as base64url.hmac. Store in $actions. **Execute:** Verify token. Route to adapter create/update/delete. Reject invalid.

**Token Sign:** `base64url_nopad(payload) + "." + base64url_nopad(hmacSha256(base64url_nopad(payload), secret))`. Base64url uses URL-safe alphabet (RFC 4648 Section 5) with padding removed. **Verify:** Split on ".". Recompute sig. Compare. Check exp > now().

**Module Boot:** For each: if first-party use real registry. If restricted create proxy that drops undeclared. Call boot(). Catch errors, continue.

**Channel Middleware:** Parse /api/channel/{module}/{path}. Find handler. Validate Bearer token (sig + exp + scope == channel:{module}). Route to handler.handle(path, query, userId, {method, body}).

## Router

**Static:** `templateDir + path + ".htx"` exists? Return it. **Index:** `templateDir + path + "/index.htx"` exists? Return it. **Dynamic:** Walk segments. At each level try exact match, then scan directory for files/directories matching `[name].htx` or `[name]/`. Extract parameter name from brackets. Collect params. Engine MUST NOT assume specific parameter names.

## Token Formats

**Action:** `base64url({"action","type","recordId","exp"}).base64url(hmac)` TTL: 1 hour.
**Channel:** `base64url({"sub","scope","exp","jti"}).base64url(hmac)` TTL: 120 seconds.
**Signed URL:** `path?sig=base64url(hmac(path:exp))&exp=timestamp` TTL: 1 hour.

## Interface Signatures

```
Module: name()→string, manifest()→{trust,contextProviders?,channelHandlers?,middleware?}, boot(registry)→void
Middleware: name()→string, handle(request, next:()→response)→response
ContextProvider: resolve(request)→map<string,any>
ChannelHandler: module()→string, handle(subPath, query, userId, {method,body})→{status,data}
ContentAdapter: query({type,where?,order?,limit?,offset?})→Record[] (empty array if no records or type unknown), get(type,identifier)→Record|null, create(type,data)→Record, update(type,id,data)→bool, delete(type,id)→bool. Adapter MUST be safe for concurrent invocation. Where clauses from user input MUST use parameterized queries.
```

**Component prop substitution** uses `{{ propName }}` syntax INSIDE component files. This is a composition-stage string replacement, NOT the htx:v expression system. Props are replaced before expression evaluation. htx:v operates on the data context. `{{ }}` operates on component parameters. Two distinct mechanisms.

**Request body parsing:** The engine must parse POST bodies. JSON (Content-Type: application/json) and form-urlencoded (application/x-www-form-urlencoded). Form-urlencoded parsing MUST decode both `+` as space and `%XX` percent-encoded characters per RFC 3986. Parsed into request.body map.

**Cookies:** Parse Cookie header into key=value pairs. Set-Cookie on responses for session management.

## File Conventions

Template dir: `templates/`. Layout: `_layout.htx`. Placeholder: `__content__`. Dynamic: `[param].htx`. Extension: `.htx`. Static: `public/`. Topologies: `topologies/`. TSX pragma: `/** @jsxRuntime classic */\n/** @jsx h */\n`.

## Verification (22 Tests)

```
 1. Home page renders with layout
 2. 404 for missing route
 3. Dynamic [slug] resolves with params
 4. Include expands partial
 5. Component renders with props + slot
 6. htx:v resolves, pipes work, HTML escaped
 7. htx:v raw outputs unescaped
 8. Script blocks untouched by expression engine
 9. htx:raw blocks untouched
10. htx:data + htx:each renders database records
11. htx:if true shows, false hides
12. htx:else shows when condition false
13. htx:empty renders for empty collection
14. htx:grant materializes signed token
15. htx:auth hides from unauthenticated
16. htx:layout none = no wrapping
17. htx:layout src = explicit layout
18. Channel API 200 with valid token
19. Channel API 401 with invalid token
20. Channel API 403 with wrong scope
21. Action token roundtrip succeeds
22. Tampered action token rejected
```

All 22 pass = conformant engine.
