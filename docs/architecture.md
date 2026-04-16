<!-- chronological_ordinal: 8 -->
# An Architectural Style for Progressive Representational State Transfer with On-Demand Code

**Jared Foy**
**April 2026**

---

## Abstract

A server-rendered HTML string is indifferent to the attributes it carries. A browser rendering that HTML is indifferent to the server process that produced it. This mutual indifference — two interpreters executing deterministically on a shared medium, each ambivalent to the other's instructions — is a property induced by REST's client-server constraint operating on a string-based representation format. The property has been present in every HTTP response since 1993. It has not, until now, been named.

This paper identifies the property as **Ambivalent Execution with Agnostic Determinism** and presents the architectural style that follows from taking it seriously. The bilateral boundary — the namespace separation between the server's instructions and the client's instructions within a single source representation — defines a design space. At maximum ambivalence, the representation induces maximum architectural properties: cacheability, universality, server authority, statelessness, and completeness. Each progressive application of code-on-demand is a constraint that narrows the ambivalence, induces a specific client-side capability, and trades specific architectural properties.

The PRESTO (Progressive Representational State Transfer with On-demand code) architectural style formalizes this design space as a navigable spectrum. The developer authors a source representation that carries instructions for both interpreters — the server's directives in the `htx:` namespace and the client's affordances in standard HTML. The server consumes its instructions through a deterministic resolution pipeline. The client receives what remains. The developer's authorial decisions — which constraints to apply, which directives to embed, which capabilities to grant — determine where on the spectrum of ambivalence each feature of the page resides.

The style is evaluated through six independent implementations across six programming languages (TypeScript, Go, Elixir, Python, Rust, C), each conforming to the same specification and passing the same 22-test verification suite. The specification converges through independent implementation: each language's constraints reveal consequences of the architecture that previous implementations missed.

---

## 1. The Property

### 1.1 Observation

In 2024, the author observed a PHP function concatenating an HTML string. The string contained an `hx-get` attribute — an instruction for the htmx library on the client. The PHP function did not parse the attribute. It did not know the attribute meant anything. It concatenated the string and delivered it.

The server did not care about the client's instruction.

The observation was then applied in reverse: the client does not care about the server's instructions — because the server consumed them before the client saw the document. A directive like `htx:data` resolves during the server's pipeline, producing HTML that replaces the directive. By the time the browser receives the response, every server directive has been consumed. The client is not merely indifferent to them. It is unaware they existed.

This mutual indifference is not a feature of PHP, or of htmx, or of any specific template engine. It is a property of the medium. HTML is a string. Strings do not enforce semantic boundaries. A server that produces strings and a client that consumes strings will naturally be ambivalent to each other's concerns — because the concerns are encoded as characters in a string, and string production does not require semantic comprehension.

### 1.2 The Property Named

The property is **Ambivalent Execution with Agnostic Determinism**.

**Ambivalent** — in two senses. First, from the common usage: neither interpreter cares about the other's instructions. The mutual indifference is structural. Second, from the etymology (*ambi* + *valentia*): the source representation carries two valences — two sets of affordances, two directions of capacity — in one document. The server valence is the `htx:` namespace: directives that declare data needs, composition, grants, and mutations. The client valence is the HTML namespace: elements, scripts, and attributes that declare rendering, behavior, and interaction.

**Execution** — both interpreters actively process the document. The server executes its resolution pipeline. The client executes its rendering and scripting. Two execution passes on one artifact.

**Agnostic** — each interpreter is structurally unaware of the other's behavior. The server does not know the client will open a WebSocket from the token it embedded. The client does not know the server ran fourteen modules to produce the HTML it received. The agnosticism is induced by the namespace separation, not by design choice.

**Determinism** — each interpreter's execution is deterministic given its input. The server will always resolve the same directives the same way. The client will always render the same HTML the same way. The bilateral boundary guarantees that neither interpreter's determinism interferes with the other's.

### 1.3 Conditions

The property is induced when three conditions are met:

1. A **shared medium** that does not enforce semantic boundaries (HTML as a character string)
2. **Two interpreters** that read the same medium for different instructions (server engine, browser)
3. A **namespace convention** that separates one interpreter's instructions from the other's (`htx:` prefix for server directives, standard HTML for client instructions)

These conditions are met by every server-rendered HTML page served over HTTP. The property has been present since the first HTTP response. It was not recognized because each domain's practitioners see their instance too deeply to see it as an instance of a general principle.

---

## 2. The Bilateral Boundary

### 2.1 Definition

The bilateral boundary is the formal expression of the property in web architecture. It is the namespace separation within the source representation that divides the server's instructions from the client's instructions.

The source representation is **bilateral**: it carries both server affordances (htx: directives the engine consumes) and client affordances (HTML, scripts, attributes the browser interprets). Resolution transforms this bilateral form into a **unilateral** resolved representation where only client affordances remain.

The structural analogy is precise: a DNA sequence carries overlapping reading frames — the same nucleotide string encodes instructions for multiple molecular interpreters simultaneously, each reading its own frame with agnostic determinism (Itzkovitz & Alon, 2007). The source representation is the web's overlapping reading frame. The server reads the `htx:` frame. The browser reads the HTML frame. Neither interferes with the other's reading. The server consumes its frame before the browser sees the document — just as transcription machinery processes its reading frame before translation begins.

This is the foundational operation. Every design decision in the architecture traces to preserving this bilateral boundary.

### 2.2 The Author's Position

The developer writes a source representation that simultaneously addresses two interpreters. The `htx:` directives are instructions to the server. The HTML, scripts, and attributes are instructions to the client. The developer must hold both audiences in mind simultaneously, understanding that one will consume its instructions before the other sees the document.

This is bilateral authorship — a mental model not previously formalized in web architecture literature. Fielding's dissertation describes the architect's perspective (constraint selection and property evaluation). Framework documentation describes API surfaces. Template language documentation describes syntax. The bilateral authorship model describes what it means to write a document that two interpreters will read sequentially, where the first erases its instructions before the second sees the page.

### 2.3 The Design Space

The bilateral boundary defines a design space. The developer navigates this space by selectively applying constraints in the source representation. Each constraint is a directive, a grant, a script, or a behavioral declaration that narrows the server's ambivalence — the server now cares about what it embeds — while inducing a specific client-side capability.

The design space is not a ladder from simple to complex. It is a spectrum of ambivalence from maximum properties (no additional constraints) to maximum capability (all available constraints applied). The developer's skill is navigating this spectrum — applying only the constraints each feature requires, preserving every property that unnecessary constraints would trade away.

---

## 3. The Constraint-Property Spectrum

### 3.0 Maximum Ambivalence (Layer 0): The Surface

At maximum ambivalence — no constraints applied beyond REST's own — the source representation is pure HTML with server-resolved data directives. The engine queries data, evaluates expressions, composes components, and emits a complete HTML document. The client receives finished HTML.

**Properties induced (free — no constraint cost):**

- **Full cacheability.** Any HTTP intermediary can cache the response. No cache invalidation strategy required.
- **Universal accessibility.** Any device that renders HTML can consume the representation. No JavaScript runtime required.
- **Complete server authority.** The server controls everything the client sees.
- **Intermediary transparency.** Proxies, CDNs, load balancers operate on the response without application knowledge.
- **Search indexability.** The content is in the HTML.
- **Graceful degradation.** There is nothing to degrade from.
- **Statelessness.** Each request is independent.
- **Complete representation.** The response contains everything needed to render the page.

These properties are not features. They are consequences of not constraining the representation further. They are what REST's constraints induce when code-on-demand is not applied.

Most features live here. More features than the industry currently believes can live here.

### 3.1 First Constraint (Layer 1): Declarative Client-Side Attribute Interpretation

**Constraint applied:** The representation includes HTML attributes (`hx-get`, `hx-swap`, `hx-trigger`) that a client-side library (htmx) interprets to perform partial page updates.

**Capability induced:** Partial page updates without full navigation. Server-rendered HTML fragments replace regions of the document.

**Properties traded:** Marginal visibility reduction. Dependency on a 14KB client library.

**Properties preserved:** Server authority (the server renders every fragment). Cacheability (fragments are cacheable). Statelessness. Complete initial representation.

**The author's decision:** "Does this feature need partial updates without full page navigation?" If yes, add htmx attributes. If no, stay at maximum ambivalence. The cost is minimal. The surface properties are almost entirely preserved.

### 3.2 Second Constraint (Layer 2): Scoped Imperative Code Execution

**Constraint applied:** The representation includes `htx:script` blocks — imperative JavaScript scoped to a component's DOM element. The engine extracts the script, wraps it in an IIFE with a `data-htx-id` element binding, and injects it before `</body>`.

**Capability induced:** Client-side behavior that HTML alone cannot express — dialogs with ESC-to-close, sliders with live value display, dropdowns with keyboard navigation.

**Properties traded:** Reduced visibility. The client's behavior is no longer fully determined by examining the HTML alone. The representation now carries executable code.

**Properties preserved:** Complete representations (the document is finished before scripts execute). Server authority over content (the script enhances, it does not construct). Cacheability of the HTML response.

**The author's decision:** "Does this feature need behavior that declarative attributes cannot express?" If yes, add an `htx:script`. The script enhances a complete document. It does not construct one.

### 3.3 Third Constraint (Layer 3): Server-Pushed Executable Code Over Persistent Connection

**Constraint applied:** The server pushes JavaScript to the client over a WebSocket connection, authorized by a scoped channel token issued via `htx:grant`.

**Capability induced:** Dynamic, server-authoritative code delivery. Per-user capability differentiation. The server decides what code each client receives.

**Properties traded:** Statelessness is partially surrendered (the WebSocket is persistent). The client's execution environment is shaped by what the server pushed, which is not visible in the initial HTML representation.

**Properties preserved:** Server authority over what code is delivered. The initial representation is still complete.

**The author's decision:** "Does this feature need server-pushed, per-user code?" If yes, accept the WebSocket constraint. The cost is partial statelessness.

### 3.4 Fourth Constraint (Layer 4): Authenticated Data Channel

**Constraint applied:** The pushed code opens a scoped HTTP connection to the server using a signed channel token. The token authorizes access to a specific module's data endpoints.

**Capability induced:** REST-style data access from client-side code. Standard HTTP debugging and caching of data requests. The pushed code can fetch, post, and subscribe.

**Properties traded:** Additional connection overhead. The client now fetches data independently of template rendering, approaching (but not reaching) the thick-client model.

**Properties preserved:** Server authority over data access (token-scoped). Standard HTTP for data requests. The initial representation is still complete.

**The author's decision:** "Does this feature need its own data channel?" If yes, accept the second connection and the token-scoped access pattern.

### 3.5 Fifth Constraint (Layer 5): Client-Controlled Rendering and Routing

**Constraint applied:** The client assumes rendering authority within a bounded region of the representation. Client-side routing, state management, and autonomous UI updates operate within the boundary.

**Capability induced:** Preserved client state across navigations. Application-like interaction. The client manages its own rendering lifecycle within the bounded region.

**Properties traded:** Server authority over rendering is delegated within the boundary. SEO requires the Layer 0 shell. The client is responsible for its own state within the region. Cacheability is suspended within the boundary.

**Properties preserved:** The Layer 0 representation at the HTTP boundary (the page is complete HTML). All surface properties hold outside the bounded region.

**The author's decision:** "Does this feature need client-controlled rendering?" If yes, accept the delegation within a bounded region. The cost is significant. Confine the boundary to the smallest possible region. Everything outside it retains the surface properties.

### 3.6 Sixth Constraint (Layer 6): Binary Computation in Client Sandbox

**Constraint applied:** WebAssembly modules execute in the browser's sandboxed virtual machine, compiled from C, Rust, or AssemblyScript.

**Capability induced:** Near-native computation speed. Capabilities that JavaScript cannot efficiently provide — image processing, physics simulation, cryptographic operations, ML inference.

**Properties traded:** WASM compilation required. Significant client-side computation. Maximum distance from the surface. Maximum constraint cost.

**Properties preserved:** The Layer 0 shell at the HTTP boundary. Binary computation is sandboxed. The module cannot escape the browser's security model.

**The author's decision:** "Does this feature need native-speed computation?" If yes, accept the compilation cost and the binary delivery mechanism. This is the deepest constraint the architecture supports.

**The enterprise implication:** When WASM binaries are delivered ephemerally over an authenticated WebSocket (pushed by the server, never stored on disk, executed in a sandboxed VM, discarded after use), the server achieves **server-authoritative distributed client compute**. The computation executes on the client's hardware — distributing the compute cost — while the intellectual property (the binary) never leaves the server's authority. It is granted as a scoped capability (via `htx:grant`), delivered over an authenticated channel, and consumed without persistence. This dissolves the traditional tradeoff between compute distribution and IP protection.

### 3.7 The Spectrum Summarized

| Depth | Constraint Applied | Capability Induced | Key Property Traded |
|-------|-------------------|-------------------|-------------------|
| Layer 0 | None beyond REST | Full REST properties | None |
| Layer 1 | Client-side attribute interpretation | Partial page updates | Marginal visibility |
| Layer 2 | Scoped imperative code | Scripted behavior | Visibility |
| Layer 3 | Server-pushed code over WebSocket | Dynamic code delivery | Partial statelessness |
| Layer 4 | Authenticated data channel | REST-style data from client | Independent data fetching |
| Layer 5 | Client-controlled rendering | Application-like interaction | Server authority (within boundary) |
| Layer 6 | Binary computation (WASM) | Native-speed processing | Maximum constraint cost |

Reading top to bottom: each row applies a constraint, gains a capability, and trades a property.

Reading bottom to top: each row removes a constraint, loses a capability, and recovers a property.

The developer navigates this spectrum per feature, per page. A page can have content at Layer 0, a search input at Layer 1, a dialog at Layer 2, and a chart at Layer 5 — each feature at the shallowest depth its requirements demand. The architecture does not force a global choice.

---

## 4. Architectural Encapsulation

### 4.1 The Encapsulation Principle

The REST representation, because it is complete and self-describing, can serve as the enclosing boundary for any client-side architecture — including architectures whose own constraints are more restrictive than REST's.

A React component tree mounted into a server-rendered div operates as a distributed object architecture within the region the REST representation allocated for it. The DO model's constraints (component state, virtual DOM reconciliation, render cycle) apply within the bounded region. The REST model's constraints (statelessness, complete representations, uniform interface) apply at the HTTP boundary.

This is not a workaround. It is the natural consequence of the bilateral boundary. The server's portion of the representation was consumed. The client's portion — including the bootstrapping instructions for the bounded architecture — survived. The representation carried the instructions. The boundary guaranteed non-interference.

### 4.2 Nesting Direction

The encapsulation is asymmetric. The DO model can be nested within REST. REST cannot be nested within the DO model in a way that preserves REST's properties.

The reason: REST's properties are induced by constraints on the outermost interaction. If REST is the outer style, cacheability, completeness, and server authority hold at the HTTP boundary regardless of what operates within. If the DO model is the outer style — as in a conventional React application — the HTTP exchange serves an empty shell. The REST properties are structurally absent because the outer boundary does not enforce REST constraints.

SSR in React is an attempt to surface toward REST's properties. The surfacing is temporary; hydration pulls the architecture back to depth. The properties are recovered momentarily, then abandoned.

Under correct encapsulation — REST as outer, DO as inner — the properties are permanent at the outer boundary. The inner architecture gains its capabilities within its bounded region. Neither compromises the other.

### 4.3 The Island Protocol

The encapsulation is made practical through a standard interface: `defineIsland()`. Any React, Vue, Svelte, or vanilla JavaScript package can be mounted into a bounded region of the representation using the same protocol:

1. The island author writes a `defineIsland({ name, mount })` definition
2. The builder bundles it into a self-contained JavaScript file
3. The template author places a `<template>` data bridge and an `<htx:component src="/ui/island.htx">` mount point
4. The engine resolves the template, preserving the mount point and data bridge as standard HTML
5. The client loads the bundle and mounts the island into the prepared region

The protocol was verified with seven npm packages across five interaction domains: React Query (data fetching), Recharts (charting), TipTap (rich text), Leaflet (maps), CodeMirror (code editing), dnd-kit (drag-and-drop), and a pure WebGL renderer (3D). A full React SPA with its own router and state management was also mounted as a single island.

---

## 5. The Specification (htxlang)

### 5.1 Distinction of Levels

The architectural style (PRESTO) describes the constraints and the properties they induce. The specification (htxlang) describes how a conformant engine implements the bilateral resolution — the 22-stage pipeline that transforms a bilateral source representation into a unilateral resolved representation.

The specification defines 8 contracts, 16 directives, and a deterministic pipeline ordering. It is language-agnostic. A conformant engine can be implemented in any language that can serve HTTP and process strings.

### 5.2 The 16 Directives

Each directive is a constraint that the author applies to the source representation. Each declares an intent that the engine fulfills:

| Directive | Author's Declaration |
|-----------|---------------------|
| `htx:data` | "I need data from the database" |
| `htx:each` | "Repeat this for each item" |
| `htx:if` / `htx:else` | "Show this conditionally" |
| `htx:v` | "Output this value" |
| `{htx:}` | "Bind this value to an attribute" |
| `htx:component` | "Use this reusable composition" |
| `htx:include` | "Embed this partial" |
| `htx:let` | "Bind this variable" |
| `htx:action` | "This page can perform this mutation" |
| `htx:grant` | "Issue a signed credential for this capability" |
| `htx:auth` / `htx:unauth` | "Show this based on authentication state" |
| `htx:layout` | "Use this layout wrapper" |
| `htx:script` | "Execute this on the client, scoped to this component" |
| `htx:raw` | "Do not process this region" |
| `htx:props` / `htx:slot` | "This component accepts these parameters" |

Each directive operates on the server valence of the bilateral boundary. Each is consumed during resolution. None survives to the client.

### 5.3 The Uniform Directive Interface

Every directive that reads from the data context operates through the same uniform interface: a module registers a context provider, the provider injects data at Stage 4 of the pipeline, and the directive evaluates the data at its designated stage. The directive does not know which module provided the data. The module does not know which directive will consume it.

This means `htx:auth` works with any auth provider. `htx:data` works with any content adapter. `htx:grant` works with any credential provider. The template references the directive interface, not the implementation. There is no lock-in because the template never references the implementation.

### 5.4 Declarative Convergence

The uniform directive interface induces a property that deserves explicit treatment: **force multiplication through declarative convergence**.

Each directive in the source representation acts as a convergence point. Behind the directive stands the full composable depth of the server — adapters, modules, services, security infrastructure, LLM integration, any capability that can be wired into the pipeline. The directive collapses this depth into a single declarative expression. The client receives only the resolved output. The complexity of the server is not transferred to the client. It is consumed by the engine.

Consider `{htx:authUser.name}`. This expression resolves to the authenticated user's name. It does not know whether the identity was established by a native HMAC token, an httpOnly cookie, an OAuth session via a third-party library, or a magic link. The expression is stable. The resolution path is composable. Each new auth adapter extends what the expression can resolve from — without changing the expression.

The same pattern holds for every directive:

- `htx:data` converges data resolution. Adding a new `ContentAdapter` (Convex, a remote API, a distributed database) extends what `htx:data` can query — without changing any template that uses it.
- `htx:action` converges mutation authorization. Adding fingerprint binding, nonce verification, or identity scoping to the `ActionTokenService` extends what `htx:action` seals into each token — without changing any template that declares an action.
- `htx:grant` converges capability issuance. Adding new channel handlers or WebSocket topology delivery extends what `htx:grant` can authorize — without changing any template that requests a grant.

The directive is the aperture. The server's capabilities are the light source. The aperture is fixed and finite (16 directives). The light source is composable and unbounded (any number of modules, adapters, and services). Adding capability behind the aperture extends what every existing template can do — without modifying any template.

This is why the visual editor, the AI generator, and the CLI installer all operate on the same 16-directive surface. The surface is stable because it is declarative. The capabilities behind it grow because they are composable. The bilateral boundary guarantees the separation: the server resolves, the client renders, and the template is the convergence point between two interpreters that never interfere.

The 16 current directives are not a closed set. They are the set that the current constraints prescribe. Any server capability that has no declarative convergence point — any capability that currently requires custom route handlers or client-side JavaScript to bridge between server knowledge and client representation — is a candidate for a new directive. The directive does not create the capability. It makes the capability declarative, and therefore available to every consumer of the source representation format.

### 5.5 The 22-Stage Pipeline

The pipeline is a deterministic sequence of string transformations:

```
 1. Static file serving
 2. Channel API with Bearer validation
 3. Middleware chain execution
 4. Context provider injection
 5. Pre-layout template processors
 6. htx:include expansion
 7. htx:component resolution
 8. Page-level htx:script extraction
 9. htx:let binding
10. htx:data resolution
11. htx:grant materialization
12. htx:action token preparation
13. htx:auth / htx:unauth conditional
14. htx:each / htx:if control flow
15. htx:v / {htx:} expression evaluation
15b. Layout directive extraction
16. Directive stripping
17. Post-layout template processors
18. Layout wrapping
19. Post-layout resolution pass
20. Script injection
21. Final expression pass
22. Script finalization, htx:raw stripping
```

Each stage receives a string and produces a string. The input to stage 1 is the source representation (bilateral). The output of stage 22 is the resolved representation (unilateral). The pipeline is the mechanism by which the server consumes its valence.

---

## 6. Evaluation

### 6.1 Cross-Language Verification

The specification was implemented independently in six programming languages:

| Engine | Language | Paradigm | Lines | Memory | Tests |
|--------|----------|----------|-------|--------|-------|
| presto-engine | TypeScript | OOP + async | ~4,000 | 112 MB | 33/33 |
| presto-go | Go | Imperative + goroutines | 2,173 | 19.8 MB | 22/22 |
| presto-elixir | Elixir | Functional + BEAM | 1,906 | 127 MB | 22/22 |
| presto-python | Python | Dynamic | 1,172 | 38 MB | 22/22 |
| presto-rust | Rust | Ownership | 2,322 | N/A | 22/22 |
| presto-c | C | Manual memory | 3,122 | 11.2 MB | 22/22 |

Each engine was built from the same specification document. Each passes the same verification suite. The specification converges through implementation: each language's constraints reveal consequences previous implementations missed.

### 6.2 Engine Boundedness

The engine does not grow with application complexity. Implementation ranges from 1,172 lines (Python) to 3,122 lines (C). The variation is language expressiveness, not engine complexity. The specification defines a fixed-size problem. A page with three posts and a page with three thousand posts traverse the same 22-stage pipeline.

### 6.3 The Seed

The specification is encapsulated in a 2,020-word self-contained knowledge capsule (the PRESTO seed) designed to be loaded as an AI system prompt. The seed contains the 8 contracts, 16 directives, 22-stage pipeline, core algorithms, and verification suite. It was tested by producing conformant engines in six languages.

---

## 7. The Navigation Model

### 7.1 Home Depth

Every developer has a **home depth** — the constraint level whose trade-offs match the majority of their problems. The developer internalizes that level's mental model and treats other levels as bounded excursions.

- A content-heavy site lives at Layer 0. The developer thinks in templates and data directives.
- A SaaS application lives at Layer 2. The developer thinks in server-rendered pages with scoped scripts.
- A complex interactive tool lives at Layer 5 (within bounded regions). The developer thinks in components and state.

An escape hatch that fires constantly is a signal that the developer has chosen the wrong home depth. If you're at Layer 5 and constantly surfacing to Layer 0, you should be living at Layer 2.

### 7.2 The Escape Hatch Goes Up

The escape hatch goes toward the surface — toward more properties, not more capabilities. Surfacing from Layer 5 to Layer 2 recovers server authority, cacheability, and search indexability. The developer gains properties. The cost is a wider mental model at the shallower depth.

---

## 8. Relationship to Fielding

Fielding derived REST by starting from the null style and adding constraints one at a time, documenting the properties each induced. PRESTO follows the same method, starting from REST rather than from the null style, and adding progressive code-on-demand constraints one at a time through the bilateral boundary.

Fielding designated code-on-demand as optional. He did not explore it as a spectrum. PRESTO explores it as a spectrum — seven levels of progressive constraint application, each independently adoptable, each with explicit property trade-offs.

The bilateral boundary itself — the namespace separation within the representation that enables two interpreters to coexist without interference — is a property that Fielding's constraints induce but that his dissertation did not name. The property was present in every HTTP response described by REST. It was not articulated as a formal concept.

Ambivalent Execution with Agnostic Determinism is the property. The bilateral boundary is its expression in web architecture. PRESTO is the architectural style that makes the resulting design space navigable.

---

## 9. Conclusion

The web's architectural strength was always the complete representation — a document sent in full, rendered immediately, navigable without JavaScript. The property that makes this possible — two interpreters executing on a shared medium with mutual ambivalence and agnostic determinism — was present from the first HTTP response. It was never named.

PRESTO names it, formalizes the design space it defines, and provides the tools to navigate that space. The bilateral boundary separates the server's instructions from the client's. The progressive constraint model maps the trade-offs at each level of ambivalence. The specification makes the model implementable. The implementations prove the model correct.

The developer's task is not to choose a framework. It is to navigate a design space — applying constraints that induce the properties each feature requires, preserving the properties that unnecessary constraints would trade away. The architecture does not prescribe where the developer lives. It gives the developer the full spectrum and trusts the problem space to determine the natural depth.

The engine is bounded. The specification is complete. The property is real. The design space is navigable. The representations are strings.

Strings all the way down.

---

## References

1. Fielding, R.T. (2000). *Architectural Styles and the Design of Network-based Software Architectures*. Doctoral dissertation, University of California, Irvine.

2. Gross, C., Stepinski, A., & Akşimşek, D. (2023). *Hypermedia Systems*. Big Sky Software.

3. Berners-Lee, T., Fielding, R., & Masinter, L. (2005). Uniform Resource Identifier (URI): Generic Syntax. RFC 3986.

4. Fielding, R., & Reschke, J. (2014). Hypertext Transfer Protocol (HTTP/1.1): Semantics and Content. RFC 7231.

5. Itzkovitz, S. & Alon, U. (2007). The genetic code is nearly optimal for allowing additional information within protein-coding sequences. *Genome Research*, 17(4), 405-412.

6. Haas, A., et al. (2017). Bringing the Web up to Speed with WebAssembly. PLDI '17.

---

*This paper describes the PRESTO architectural style and the htxlang specification. Six conformant engine implementations, the complete specification, documentation, and live demonstrations are available at the project repository (https://hypermediaapp.org). The demonstrations are live at https://demo.hypermediaapp.org.*
