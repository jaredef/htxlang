# htxlang Specification

**Version 0.2**
**Jared Foy**
**April 2026**

---

## Status

Working draft. This document specifies the contracts and mechanics of the htxlang specification as derived from the PRESTO architectural style.

## 1. Introduction

This specification defines the contracts that a conformant htxlang engine must satisfy. It specifies what must be true of the input, the output, the resolution process, and the extension contracts between them.

The key words MUST, MUST NOT, SHOULD, SHOULD NOT, and MAY in this document are to be interpreted as described in RFC 2119.

### 1.1 Relationship to PRESTO

The PRESTO architectural style extends Representational State Transfer (REST) by formalizing code-on-demand as a progressive spectrum. This specification describes contracts through which a server engine may realize the PRESTO style. The style is independent of this specification.

### 1.2 Scope

This specification defines eight contracts. Each specifies what a conformant engine MUST satisfy. How the engine satisfies each contract is an implementation decision unless a specific mechanic is normatively required.

---

## 2. The Document Model

### 2.1 Source Representation

The input to a conformant engine is a *source representation*: an HTML document augmented with server directives in a designated namespace.

A conformant engine MUST define a server namespace that is syntactically distinguishable from standard HTML elements and attributes. All directives within this namespace are server affordances.

### 2.2 Namespace Requirements

The server namespace MUST satisfy:

- **Distinguishability.** A parser MUST be able to identify server directives without semantic analysis. The namespace prefix, tag structure, or attribute convention MUST make server directives syntactically unambiguous.
- **Non-collision.** The namespace MUST NOT conflict with current or future HTML element names. Use of a prefix (e.g., `htx:`) or a custom element naming convention satisfies this requirement.
- **Completeness.** Every server affordance MUST be expressed within the namespace. No server-side behavior may be triggered by standard HTML syntax alone, with the exception of file-based routing conventions (§3.7).

### 2.3 Resolved Representation

The output of a conformant engine is a *resolved representation*: a complete HTML document in which all server directives have been consumed.

A conformant engine MUST produce output that:

- Contains no server namespace directives.
- Is valid HTML consumable by any standard user agent.
- Is complete: a user agent MUST be able to render meaningful content without executing JavaScript.

### 2.4 Bilateral Property

The source representation is bilateral: it carries both server affordances and client affordances within a single artifact.

- **Server affordances** are directives in the server namespace. They are consumed during resolution. They do not appear in the output.
- **Client affordances** are standard HTML elements, attributes, and script content. They pass through resolution unchanged.

The resolution process transforms the bilateral source into a unilateral resolved representation. The transformation is one-directional: the resolved representation carries only client affordances.

### 2.5 Script Element Opacity

Content within HTML `<script>` elements is client territory.

A conformant engine MUST NOT:
- Parse, interpret, or transform content inside `<script>` elements.
- Evaluate expression syntax that appears inside `<script>` elements.
- Inject server-resolved values into `<script>` elements (unless the script is declared as server-mediated per §3.8).

This requirement is absolute. Implementations MUST NOT provide a mechanism to override it for standard `<script>` elements. Server-mediated scripts (§3.8) are a separate construct within the server namespace.

### 2.6 Literal Blocks

A conformant engine MUST provide a mechanism to declare regions of the source representation as literal. Content inside literal blocks MUST NOT be processed by the expression evaluator or any directive resolver. Literal blocks pass through resolution as-is, with only the literal block markers removed from the output.

---

## 3. The Resolution Contract

### 3.1 Overview

Resolution is the process of transforming a bilateral source representation into a unilateral resolved representation. The engine reads the source, processes all server directives, and produces HTML.

A conformant engine MUST perform resolution as an ordered sequence of stages. The specification does not prescribe the number or naming of stages, but the following processing requirements MUST be satisfied, and the ordering constraints between them MUST be observed.

### 3.2 Ordering Constraints

The following ordering constraints are normative:

- **Inclusion before composition.** Included content MUST be expanded before components are resolved, so that included content may contain component references.
- **Composition before expression evaluation.** Components MUST be resolved before expressions are evaluated, so that component prop values are available to the expression evaluator.
- **Data binding before control flow.** Data declarations MUST be resolved before iteration and conditional directives, so that queried data is available for iteration.
- **Control flow before expression evaluation.** Iteration and conditional directives MUST be resolved before (or simultaneously with) expression evaluation, so that per-item data contexts are available to expressions within iteration blocks.
- **Directive stripping before output.** All server namespace directives MUST be removed before the resolved representation is emitted.
- **Layout wrapping after content resolution.** The content MUST be fully resolved before layout wrapping occurs.
- **Post-layout resolution.** After layout wrapping, the engine MUST perform at least one additional resolution pass to process server directives that appear in layout templates (such as includes and authentication conditionals).

Implementations MAY introduce additional stages, merge stages, or reorder stages, provided all ordering constraints are satisfied and the output is identical to a conformant sequential implementation.

### 3.3 Inclusion

A conformant engine MUST support including the content of one template file within another.

**Mechanics:**

- The source representation contains an inclusion directive specifying a file path.
- The engine reads the referenced file and replaces the directive with the file's content.
- Inclusion is recursive: included content may itself contain inclusion directives.
- A conformant engine MUST enforce a maximum recursion depth to prevent infinite loops. The depth limit SHOULD be at least 10.
- Path resolution MUST support absolute paths (relative to the template root directory) and relative paths (relative to the including file).
- A conformant engine MUST reject paths containing `..` to prevent directory traversal (§9.5).
- If the referenced file does not exist, the engine SHOULD produce a visible indicator in the output (e.g., an HTML comment) and MUST NOT halt resolution.

### 3.4 Composition

A conformant engine MUST support reusable template fragments (components).

**Mechanics:**

- A component is a template file that declares parameters (with optional default values) and a content projection point (slot).
- The including template references the component, passes parameter values, and optionally provides inner content.
- The engine reads the component file, substitutes parameter values, injects slot content, and replaces the component directive with the resolved result.
- Component resolution is recursive: components may reference other components. A conformant engine MUST enforce a maximum depth limit.
- Components that contain server-mediated scripts (§3.8) MUST have those scripts extracted during composition and collected for later injection (§3.9).

**Parameter resolution:**

- Parameters declared in the component with default values are overridden by values passed from the including template.
- Parameter values MAY contain expression references that are resolved by the expression evaluator in a later stage.

**Script scoping:**

- Scripts extracted from components MUST be scoped to the component's root DOM element. The engine MUST provide a mechanism (e.g., a unique identifier attribute) that allows the script to locate its component in the resolved document.
- Extracted scripts MUST be wrapped in an isolation construct (e.g., an immediately-invoked function expression) to prevent variable leakage between components.

### 3.5 Variable Binding

A conformant engine MUST support declaring named variables within the source representation.

**Mechanics:**

- A variable binding directive declares a name and a value.
- The value is injected into the data context and is available to all subsequent resolution stages.
- Variable values MAY reference existing data context paths.

### 3.6 Data Binding

A conformant engine MUST provide a mechanism for declaring data requirements within the source representation.

**Mechanics:**

- A data directive declares the data type (resource kind), filtering criteria, ordering, and pagination parameters.
- The engine resolves the directive by querying a content adapter.
- Query results are injected into the data context under a developer-specified name.
- The content adapter interface is not specified. Implementations define their own adapter contracts.

**Single-record mode:**

- When the directive includes a unique identifier (e.g., a slug), the engine MUST query for a single record and inject it as an object (not an array).

**Multi-record mode:**

- When no unique identifier is specified, the engine MUST query for a collection and inject it as an array.

**Multiple data directives:**

- A single source representation MAY contain multiple data directives. Each MUST be resolved independently, and their results injected under their respective names.

### 3.7 Layout Wrapping

A conformant engine MUST support wrapping resolved content in layout templates.

**Convention-based discovery:**

- The engine walks up the directory tree from the template file's location toward the template root directory.
- At each directory level, the engine checks for a designated layout file.
- If found, the layout's content placeholder is replaced with the accumulated content.
- The walk stops when a layout containing a document type declaration (`<!DOCTYPE html>` or equivalent) is reached.

**Directive-based override:**

- The source representation MAY contain a layout directive that specifies an explicit layout file. When present, the convention-based walk is bypassed and the specified layout is used.
- A "none" mode MUST be supported: when the template declares no layout, the content is emitted without any layout wrapping.

**Fragment mode:**

- When the request indicates a partial or fragment response (e.g., via the `HX-Request` header), the outermost layout (the one containing the document type declaration) SHOULD be skipped. Inner layouts SHOULD still be applied.

### 3.8 Server-Mediated Scripts

A conformant engine MUST provide a mechanism for scripts that participate in server resolution while being delivered to the client as executable code.

**Mechanics:**

- Server-mediated scripts are declared within the server namespace (distinct from standard `<script>` elements).
- During resolution, these scripts are extracted from their position in the document.
- Expression references within server-mediated scripts ARE evaluated (unlike standard script elements, which are opaque per §2.5).
- Extracted scripts are collected for injection into the resolved representation before the closing `</body>` tag.

**Expression evaluation in scripts:**

- Because server-mediated scripts are extracted before expression evaluation, the engine MUST ensure that expressions within the scripts are evaluated during or after injection. This MAY be accomplished by injecting scripts before a final expression evaluation pass, using placeholder markers that are replaced after evaluation, or any equivalent mechanism that produces correct output.

**Component-level scripts:**

- Server-mediated scripts declared within components MUST be scoped to their component (§3.4). The scoping mechanism provides the script with a reference to the component's root DOM element.

**Page-level scripts:**

- Server-mediated scripts declared at the page level (outside any component) MUST be extracted and injected without component scoping. They receive no element binding.

### 3.9 Script Injection

Collected scripts (from both component and page-level extraction) MUST be injected into the resolved representation.

**Mechanics:**

- Scripts are injected immediately before the closing `</body>` tag.
- If no `</body>` tag exists, scripts are appended to the end of the document.
- Component scripts are wrapped in isolation constructs with element bindings.
- Page-level scripts are injected without wrapping.
- The injected content MUST go through expression evaluation so that server-resolved values within the scripts are materialized.
- After expression evaluation, the injected content MUST be wrapped in standard `<script>` elements.

### 3.10 Expression Evaluation

A conformant engine MUST provide a mechanism for embedding server-resolved values in the document.

**Path resolution:**

- Expressions reference values in the data context using dot-notation paths (e.g., `post.title`, `user.address.city`).
- Array index access MUST be supported (e.g., `items.0.name`).
- If a path does not resolve, the expression MUST produce an empty string.

**Pipe functions:**

- The expression system MUST support transformation functions applied to resolved values.
- At minimum, a conformant engine MUST support: string case transformation (upper, lower) and collection length.
- Implementations MAY support additional pipe functions.

**Escaping:**

- Resolved values embedded in HTML content MUST be HTML-escaped by default (§9.2).
- A conformant engine MUST provide a raw/unescaped mode that the developer explicitly opts into.

**Attribute expressions:**

- A conformant engine MUST support embedding resolved values within HTML attribute values.
- The syntax for attribute expressions MAY differ from the syntax for content expressions, but both MUST resolve from the same data context.

### 3.11 Directive Stripping

After all resolution stages, a conformant engine MUST remove any remaining server namespace directives from the document. The resolved representation MUST contain no server namespace content.

### 3.12 Idempotence

Resolving a resolved representation (one that contains no server directives) MUST produce identical output. Resolution is idempotent on fully-resolved documents.

---

## 4. The Grant Contract

### 4.1 Purpose

Grants materialize capability credentials into the resolved representation. The grant makes the authority chain visible: the developer declares what the template authorizes, and the engine materializes the proof.

### 4.2 Grant Directive

A conformant engine MUST support a grant directive within the server namespace. The directive specifies:

- **Type**: the kind of capability being granted (connection, channel, asset, or custom).
- **Name**: the variable name under which the materialized credential is available in the data context.
- **Type-specific attributes**: additional parameters required by the grant type (e.g., the module name for a channel grant, the file path for an asset grant).

### 4.3 Credential Requirements

A materialized grant MUST produce an object in the data context containing at minimum:

- A **credential** field: a token string, signed URL, or equivalent that the client presents to access the capability.
- An **expiration** field: a timestamp after which the credential is no longer valid.

### 4.4 Credential Properties

Credentials MUST be:

- **Cryptographically signed.** The credential MUST include a signature that the server can verify. Forgery MUST NOT be feasible without the server's signing secret.
- **Time-limited.** The credential MUST include an expiration. The server MUST reject credentials presented after their expiration.
- **Tamper-evident.** Modification of any part of the credential (payload or signature) MUST cause verification to fail.

### 4.5 Scope

Credentials SHOULD be scoped to a specific resource or channel. A credential issued for one purpose SHOULD NOT grant access to unrelated resources.

### 4.6 Built-in Grant Types

A conformant engine SHOULD support:

- **Connection grant.** Produces credentials for establishing a persistent connection (e.g., WebSocket). The credential authenticates the upgrade request.
- **Channel grant.** Produces credentials for accessing a specific module's data channel (§7). The credential is scoped to the module name.
- **Asset grant.** Produces a signed URL for time-limited access to a protected static resource. The URL includes the signature and expiration as query parameters.

Implementations MAY support additional grant types via the extension contract (§6).

---

## 5. The Mutation Contract

### 5.1 Purpose

Mutations are write operations (create, update, delete) that modify server-side data. The mutation contract ensures that writes are authorized, stateless, and resistant to forgery.

### 5.2 Action Directive

A conformant engine MUST support an action directive within the server namespace. The directive specifies:

- **Name**: the action type (e.g., "create", "update", "delete").
- **Type**: the resource type being mutated.
- **Record identifier** (optional): the specific record being mutated, for update and delete operations.

### 5.3 Token Generation (Prepare Phase)

During resolution of a GET request, the engine MUST:

1. For each action directive, generate a signed token encoding the action name, resource type, record identifier (if present), and an expiration timestamp.
2. Inject the tokens into the data context under a well-known path (e.g., `$actions.{name}`).
3. Remove the action directive from the output.

The developer embeds the token in a form as a hidden field, making it available for the execute phase.

### 5.4 Token Verification (Execute Phase)

When the server receives a POST request containing a mutation token, the engine MUST:

1. Extract the token from the request body.
2. Verify the token's cryptographic signature.
3. Verify the token has not expired.
4. Extract the action name, resource type, and record identifier from the token payload.
5. Execute the mutation through the content adapter or a registered handler.
6. If verification fails at any step, reject the mutation. The engine MUST NOT execute the write.

### 5.5 Statelessness

The mutation token MUST encode all information necessary for verification and execution. The server MUST NOT maintain state between the prepare and execute phases. The token is self-contained.

### 5.6 Token Format

The token MUST consist of a payload and a signature. The payload MUST include at minimum:

- The action name.
- The resource type.
- The record identifier (if applicable).
- An expiration timestamp.

The encoding format (Base64, Base64URL, etc.) and signing algorithm (HMAC-SHA256, Ed25519, etc.) are implementation choices, provided the signature is cryptographically secure.

---

## 6. The Extension Contract

### 6.1 Purpose

The extension contract allows third-party and first-party code to extend the engine's capabilities without modifying the engine itself.

### 6.2 Module Interface

A module is a unit of extension. A conformant engine MUST define a module interface comprising:

- **Identifier**: a unique name for the module.
- **Manifest**: a declaration of the module's trust level and intended capabilities.
- **Boot function**: called by the engine during startup, receiving a registry through which the module registers its capabilities.

### 6.3 Trust Levels

A conformant engine MUST support at least two trust levels:

- **First-party.** The module has full access to all registration types. No restrictions.
- **Restricted.** The module has access only to capabilities declared in its manifest. Undeclared registrations are rejected.

Implementations MAY define additional trust levels (e.g., marketplace, tenant) with progressively narrower access.

### 6.4 Registry

The registry is the interface through which modules register capabilities. A conformant engine MUST support registration of:

- **Middleware.** Request interceptors inserted into the request processing pipeline. Middleware receives the incoming request and a `next` function. It MAY return a response directly (short-circuiting the pipeline) or call `next` to continue processing.
- **Context providers.** Data sources that inject named values into the template data context for every request. The provider receives the incoming request and returns a data object.
- **Channel handlers.** Authenticated API endpoint handlers (§7.4).

Implementations MAY support additional registration types.

### 6.5 Manifest Enforcement

For restricted modules, the engine MUST enforce the manifest:

- Registration attempts for capabilities not declared in the manifest MUST be rejected.
- Rejected registrations MUST NOT have any effect on the engine's behavior.
- The engine SHOULD log a warning when a registration is rejected.

### 6.6 Boot Lifecycle

Modules are booted during engine startup, before the engine begins accepting requests. A conformant engine MUST:

1. Accept an ordered list of modules.
2. For each module, read its manifest and determine the appropriate trust level.
3. Provide a registry (or sandboxed proxy) to the module's boot function.
4. Call the boot function.
5. If the boot function throws an error, the engine MUST log the error and continue booting remaining modules. One module's failure MUST NOT prevent other modules from booting.

---

## 7. The Channel Contract

### 7.1 Purpose

Channels provide authenticated HTTP endpoints through which delivered client code accesses server data. They are the bridge between progressive code-on-demand and server-side resources.

### 7.2 Endpoint Pattern

A conformant engine MUST expose channel endpoints at a well-defined URL pattern. The pattern MUST include the module name and a sub-path:

```
{base}/channel/{module}/{subpath}
```

The `{base}` prefix is an implementation choice (e.g., `/api`).

### 7.3 Authentication

Channel requests MUST carry a credential. The credential format is an implementation choice, but the engine MUST validate it before routing the request.

A conformant engine MUST verify:

1. **Signature validity.** The credential's cryptographic signature is correct.
2. **Expiration.** The credential has not expired.
3. **Scope.** The credential's scope matches the requested module. A credential issued for module A MUST NOT grant access to module B.

If any verification step fails, the engine MUST return an error response and MUST NOT route the request to the handler.

### 7.4 Handler Interface

A channel handler receives:

- **Sub-path**: the portion of the URL after the module name.
- **Query parameters**: URL query string parameters as key-value pairs.
- **User identifier**: extracted from the verified credential.
- **Request context** (for write operations): the HTTP method and request body.

The handler returns:

- **Status code**: an HTTP status code.
- **Response data**: a serializable data object.

The engine serializes the response data (typically as JSON) and returns it to the client.

### 7.5 Token Refresh

Channel credentials are time-limited (§4.4). A conformant engine SHOULD provide a mechanism for the client to refresh an expiring credential without re-establishing the full delivery ceremony. This MAY be a dedicated refresh endpoint or a convention within the channel handler.

---

## 8. The Delivery Contract

### 8.1 Purpose

Delivery is the mechanism by which the server provides executable code to the client as a granted capability. The server controls what code is delivered. The client does not choose what to download.

### 8.2 Compilation

A conformant engine MUST compile delivery payloads from source files. The compilation MUST occur on the server, not on the client.

- Source files MAY be in any language that compiles to client-executable code (JavaScript, TypeScript, JSX/TSX, etc.).
- Compilation MUST occur at server boot time or on-demand. It MUST NOT require an external build pipeline.
- The compiled output MUST be held in memory or on disk by the server, ready for delivery.

### 8.3 Delivery Payload

A delivery payload MUST include:

- **Name**: a unique identifier for the delivered unit.
- **Code**: the compiled executable code as a string.
- **Credential**: a scoped channel token (§4, §7) that grants the delivered code access to its corresponding data channel.

### 8.4 Transport

A conformant engine MUST support at least one delivery transport:

- **HTTP**: the client requests a named delivery unit via HTTP GET. The server responds with the payload as JSON.
- **WebSocket**: the server pushes the payload as a JSON message over an authenticated WebSocket connection.
- **Server-Sent Events**: the server streams the payload as an SSE event.

A conformant engine SHOULD support HTTP delivery at minimum, as it requires no persistent connection.

### 8.5 Client Execution

Delivered code is executed on the client with injected globals:

- **Element binding**: a reference to the DOM element where the delivered code should render its output.
- **Credential**: the scoped channel token for data access.
- **Data access function**: a pre-configured function for making authenticated requests to the channel endpoint.

The specific execution mechanism (e.g., `Function` constructor, module evaluation) is an implementation choice.

### 8.6 Ephemeral Delivery

A conformant engine MAY support ephemeral delivery: a transport connection that opens, delivers one or more payloads, and immediately closes. This pattern is consistent with the PRESTO style but is not required.

---

## 9. The Security Contract

### 9.1 Security Through Absence

The primary security property is absence. Capabilities that the server does not grant do not exist on the client.

A conformant engine MUST NOT include in the resolved representation:

- Server-side secrets, signing keys, or internal configuration.
- Server namespace directives or their attribute values.
- Content that authentication or authorization conditionals excluded.

### 9.2 Expression Escaping

Server-resolved values embedded in HTML content MUST be HTML-escaped by default. The following characters MUST be escaped:

| Character | Replacement |
|-----------|-------------|
| `<`       | `&lt;`      |
| `>`       | `&gt;`      |
| `&`       | `&amp;`     |
| `"`       | `&quot;`    |

The engine MUST provide an explicit opt-in mechanism for unescaped output. Unescaped output MUST NOT be the default.

### 9.3 Credential Security

All credentials produced by the engine (mutation tokens, channel tokens, signed URLs, connection tokens) MUST be:

- **Cryptographically signed** using a server-side secret. The signing algorithm MUST be a recognized cryptographic algorithm (e.g., HMAC-SHA256, HMAC-SHA384, Ed25519). Insecure algorithms (e.g., MD5, SHA1 without HMAC) MUST NOT be used.
- **Time-limited** with an explicit expiration timestamp encoded in the credential.
- **Verified on every use.** The engine MUST verify the signature and expiration before acting on the credential.

### 9.4 Script Isolation

The engine MUST NOT process content within standard HTML `<script>` elements (§2.5). This prevents:

- Server expression syntax from being evaluated inside client JavaScript.
- Client JavaScript syntax from being misinterpreted as server directives.
- Accidental injection of server-side values into client code without explicit developer intent.

### 9.5 Path Traversal Prevention

The engine MUST reject file paths containing `..` in:

- Inclusion directives (§3.3).
- Component references (§3.4).
- Layout directive paths (§3.7).
- Any other directive that references a file path.

Paths that resolve outside the template root directory MUST be rejected regardless of whether they contain `..`.

### 9.6 Content Security

The engine SHOULD set appropriate security headers on responses:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options` as appropriate for the application.
- `Content-Security-Policy` as appropriate for the application.

These headers are implementation-level recommendations, not specification requirements.

---

## 10. Conformance

### 10.1 Conformance Levels

A **fully conformant** engine satisfies all MUST requirements across all eight contracts.

A **partially conformant** engine satisfies all MUST requirements in contracts 1-3 (document model, resolution, security) and documents which additional contracts it supports.

### 10.2 Extensions

A conformant engine MAY extend the specification with additional features, provided:

- Extensions use the server namespace (§2.2).
- Extensions are consumed during resolution (they do not appear in the output).
- Extensions do not violate any MUST requirement of this specification.

### 10.3 Versioning

This specification is versioned. Implementations SHOULD declare which version they conform to.

---

## References

1. Fielding, R.T. (2000). *Architectural Styles and the Design of Network-based Software Architectures*. Doctoral dissertation, University of California, Irvine.

2. Foy, J. (2026). *An Architectural Style for Progressive Representational State Transfer with On-Demand Code*. Working paper.

3. Bradner, S. (1997). *Key words for use in RFCs to Indicate Requirement Levels*. RFC 2119.
