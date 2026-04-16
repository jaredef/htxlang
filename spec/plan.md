# htxlang Specification — Master Plan

**Jared Foy**
**April 2026**

## Purpose

This document plans the formal specification of htxlang: a language-agnostic description of how a server should operate within a HATEOAS environment with progressive code-on-demand, as described by the PRESTO architectural style.

The specification is distinct from:
- **The style (PRESTO)**: constraints and properties, described in the white paper
- **The syntax (.htx)**: developer-facing file format, one possible expression of the spec
- **The implementation (@htx/engine, presto-engine)**: reference engines in TypeScript

The specification occupies the middle layer. It defines contracts that any syntax must express and any implementation must satisfy.

## Audience

- Engine implementors (building a conformant engine in any language)
- Syntax designers (creating alternative HTX-like syntaxes)
- Framework evaluators (assessing conformance claims)
- The PRESTO community (understanding what the style requires at the specification level)

## Structure (W3C-aligned)

### Part I: Preliminaries

**1. Introduction**
- Relationship to the PRESTO architectural style
- Relationship to REST and HTML
- Scope: what the specification covers and does not cover
- Conformance levels (MUST, SHOULD, MAY per RFC 2119)

**2. Terminology**
- Source representation, resolved representation
- Directive, expression, grant, mutation, topology
- Resolution pipeline, resolution stage
- Module, manifest, trust level
- Bilateral, unilateral, materialized artifact, latent behavior

**3. Document Model**
- An htxlang document is an HTML document augmented with directives in a server namespace
- The server namespace prefix (htx: in the reference syntax)
- The document lifecycle: source → resolution → resolved
- The bilateral property: server directives and client content coexist

### Part II: The Resolution Pipeline

**4. Pipeline Overview**
- The pipeline is an ordered sequence of resolution stages
- Each stage consumes specific directives and transforms the document
- After all stages, the output is a standard HTML document with no server directives remaining
- The pipeline order is specified; implementations MUST process stages in this order

**5. Stage: Include Resolution**
- Directive: include with src attribute
- Absolute paths (from template root) and relative paths (from including file)
- Recursive expansion with depth limit
- Directory traversal prevention (MUST reject paths containing ..)
- Error behavior: missing includes produce HTML comments or configurable fallback

**6. Stage: Component Resolution**
- Directive: component with src attribute and prop attributes
- Props block: declares default values for component properties
- Prop substitution: replaces prop references in component content with passed values
- Slot: placeholder for content passed between component tags
- Script extraction: server-mediated scripts are extracted and collected for later injection
- Script scoping: extracted scripts receive an element binding (the component's root element)
- Recursive resolution: components may contain other components (depth-limited)

**7. Stage: Variable Binding**
- Directive: let with name and value attributes
- Injects a named value into the template data context
- Value may reference existing data paths
- Scope: available to all subsequent stages in the same template

**8. Stage: Data Resolution**
- Directive: data with type, where, order, limit, offset, slug, as attributes
- Queries a content adapter for records matching the specified criteria
- Single-record mode: when slug is specified, queries for one record
- Multi-record mode: when slug is not specified, queries for a collection
- Results injected into the template data context under the "as" name
- Adapter interface: query(options) and get(type, identifier) methods
- The adapter is an implementation-level concern; the spec defines the directive contract

**9. Stage: Grant Resolution**
- Directive: grant with type and as attributes, plus type-specific attributes
- Materializes a capability credential into the template data context
- Built-in grant types: websocket (connection credential), channel (scoped data access), asset (signed URL)
- Custom grant types: implementations MAY register additional grant providers
- Grant properties: the materialized object includes at minimum a token or url and an expiresAt timestamp
- The grant is the authority chain made visible in the source representation

**10. Stage: Mutation Preparation**
- Directive: action with name, type, and optional record attributes
- Generates a signed mutation token encoding the action, type, and record identifier
- Token injected into the data context under $actions.[name]
- Token signing: HMAC-SHA256 with server secret (implementation MUST use cryptographic signing)
- Token expiry: implementations MUST include an expiration timestamp
- The mutation token is stateless; the server stores no session between requests

**11. Stage: Authentication Conditionals**
- Directive: auth (content visible when authenticated), unauth (content visible when not authenticated)
- Optional role attribute on auth directive for role-based visibility
- Authentication state provided by a context provider (implementation-specific)
- Security through absence: content not rendered is not present in the resolved representation

**12. Stage: Control Flow**
- Iteration directive: each with items and as attributes
  - Iterates over an array in the data context
  - Per-item data context: the item variable, plus $index, $first, $last
  - Empty fallback: empty directive inside each block, rendered when collection is empty
  - Nested iteration: each blocks may be nested (depth-limited)
- Conditional directive: if with test attribute
  - Truthy evaluation: null, undefined, false, 0, empty string, empty array are falsy
  - Else clause: else directive following an if block
- Control flow directives handle their own expression evaluation for per-item contexts

**13. Stage: Expression Evaluation**
- Expression tags: resolve values from the data context into the document
  - Text content: inline element with the data path as content
  - Attribute values: brace-delimited syntax within HTML attributes
  - Raw mode: flag on the expression tag to output unescaped HTML
- Pipe functions: transformations applied to resolved values (uppercase, lowercase, capitalize, trim, length, json)
- Path resolution: dot-notation traversal of nested objects and arrays
- HTML escaping: expressions are HTML-escaped by default (MUST escape <, >, &, ")
- Script block protection: the expression evaluator MUST NOT process content inside HTML script elements
- Raw block protection: the expression evaluator MUST NOT process content inside raw blocks
- Missing values: undefined paths resolve to empty string

**14. Stage: Directive Stripping**
- All remaining server namespace directives are removed from the document
- The resolved representation contains no server directives
- The output is standard HTML

**15. Stage: Layout Wrapping**
- Convention: the engine walks up the directory tree from the template file, collecting layout files
- Layout files contain a content placeholder that is replaced with the page content
- The walk stops when a layout containing a doctype declaration is found
- Directive override: a layout directive in the template specifies an explicit layout file
- None mode: a layout directive with "none" produces raw output (no wrapping)
- Fragment mode: when the request indicates a partial/fragment (e.g., HTMX), the root layout (containing doctype) is skipped

**16. Stage: Script Injection**
- Collected scripts (from component resolution and page-level extraction) are injected before the closing body tag
- Component scripts are wrapped in IIFEs with element bindings
- Page-level scripts are injected as-is
- Injected scripts go through a final expression evaluation pass
- After evaluation, script placeholders are replaced with HTML script elements

### Part III: Extension Points

**17. Module System**
- Module interface: name, manifest, boot
- Manifest: declares trust level and capabilities
- Trust levels: first-party (full access), marketplace (sandboxed), tenant (quarantined)
- Registration: middleware, context providers, channel handlers, template processors
- Sandboxing: non-first-party modules receive a proxy registry that enforces manifest declarations
- Undeclared registrations are silently dropped (implementations SHOULD log warnings)

**18. Channel Handlers**
- HTTP endpoint pattern: /api/channel/{module}/{subpath}
- Authentication: Bearer token in Authorization header
- Token validation: verify signature, check expiry, match scope to channel:{module}
- Handler interface: handle(subPath, query, userId, context) returns { status, data }
- Context includes method and body for POST/PUT/DELETE requests

**19. Middleware**
- Request interceptors with next() chain
- May short-circuit the pipeline by returning a response without calling next()
- Ordered: middleware executes in registration order

**20. Context Providers**
- Provide named data to every template
- Resolve method receives the full request object
- Results injected into the template data context before any template processing

**21. Template Processors**
- Pre-layout: transform content before layout wrapping (may trigger redirects)
- Post-layout: transform content after layout wrapping (may trigger redirects)

### Part IV: Real-Time Protocol

**22. WebSocket Ceremony**
- Connection: client opens WebSocket with authentication token
- Authentication: server validates token on upgrade
- Topology request: client sends message requesting a named topology
- Topology delivery: server responds with compiled code + scoped channel token
- Ephemeral mode: connection may close immediately after delivery
- Persistent mode: connection may remain open for pub/sub and bidirectional messaging

**23. Topology Delivery**
- Three transports: WebSocket (message), HTTP (GET endpoint), SSE (event stream)
- Delivery payload: name, compiled code, channel token
- Client execution: code executed via Function constructor with injected globals (ws, el, channelToken, channelFetch)
- Compilation: server compiles topology source files at boot (TypeScript, TSX with JSX pragma)

**24. Topology Compilation**
- Source formats: JavaScript (.js), TypeScript (.ts), TSX (.tsx)
- TSX compilation: JSX pragma prepended, classic runtime transform targeting the DOM helper function
- Compilation timing: at server boot, not at request time
- Hot reload: file watcher triggers recompilation and broadcasts to connected clients

### Part V: Security

**25. Security Model**
- Security through absence: unprovided capabilities do not exist on the client
- Token scoping: channel tokens are bound to specific module names
- Token expiry: all tokens include expiration timestamps
- Signed mutations: action tokens are cryptographically signed with server secret
- Signed assets: protected resource URLs carry HMAC signatures with expiry
- Directory traversal: include and component resolution MUST reject paths containing ..
- Expression escaping: all expressions are HTML-escaped by default
- Script isolation: the expression evaluator never processes HTML script block contents

**26. Trust Levels**
- First-party: full engine access, no restrictions
- Marketplace: sandboxed registry, only declared capabilities permitted
- Tenant: maximum restriction, undeclared registrations dropped
- Client-side trust (future): document level (open), scoped (ShadowDOM), quarantined (iframe)

### Part VI: Conformance

**27. Conformance Requirements**
- A conformant engine MUST implement all resolution pipeline stages in the specified order
- A conformant engine MUST support all built-in directive types
- A conformant engine MUST HTML-escape expression output by default
- A conformant engine MUST protect script blocks from expression evaluation
- A conformant engine MUST use cryptographic signing for mutation and channel tokens
- A conformant engine MUST support the module system with manifest-based sandboxing
- A conformant engine SHOULD support all three topology delivery transports
- A conformant engine MAY extend the directive set with custom directives in the server namespace

**28. Conformance Test Suite**
- A companion test suite provides machine-verifiable conformance tests
- Each test specifies: input template, data context, expected output
- Tests are organized by pipeline stage
- Implementations run the test suite to verify conformance

### Appendices

**A. Directive Reference**
- Complete table of all directives with attributes, behavior, and examples

**B. Expression Syntax**
- Formal grammar for expression paths, pipe functions, and attribute expressions

**C. Token Formats**
- Structure of action tokens, channel tokens, and signed URLs

**D. Media Type Registration**
- text/htx for .htx source representations (if pursued through IANA)

---

## Implementation Plan

### Phase 1: Skeleton
Create the spec document structure with all section headings and preliminary content.

### Phase 2: Pipeline Specification
Write the full resolution pipeline (sections 4-16) with precise normative language.

### Phase 3: Extension Points
Write the module system, channel handlers, middleware, context providers (sections 17-21).

### Phase 4: Real-Time Protocol
Write the WebSocket ceremony, topology delivery, compilation spec (sections 22-24).

### Phase 5: Security
Write the security model and trust levels (sections 25-26).

### Phase 6: Conformance
Write conformance requirements and design the test suite structure (sections 27-28).

### Phase 7: Appendices
Directive reference table, expression grammar, token formats.

### Phase 8: Review
Cross-reference against both v1 and v2 engines. Verify every normative requirement is testable.
