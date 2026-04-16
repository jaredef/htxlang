<!-- chronological_ordinal: 10 -->
# Thinking in PRESTO: The Bilateral Model

**Jared Foy**
**April 2026**

*A companion essay to "An Architectural Style for Progressive Representational State Transfer with On-Demand Code"*

---

## The Observation

This work began with an observation about a PHP function.

A server-side function constructed an array of strings — each string a fragment of HTML. The function populated these strings with dynamic content from a database query. The result was a complete HTML representation, assembled on the server, sent to the browser. Standard server-side rendering, unremarkable in its mechanics.

What was remarkable was what happened when htmx attributes were added to those strings. The server didn't care. The HTML attributes that instructed the browser to make partial AJAX requests, swap content, and handle events were meaningless to the server — they were just characters in a string. The server's job was to resolve data and produce HTML. The client's job was to interpret the HTML and act on the attributes it found.

This is latent binding in its simplest form: behavior embedded in a representation that only activates when the representation reaches the client. The server doesn't execute the htmx attributes. The browser doesn't execute the database query. Each side does its own work, connected by a complete HTML document that serves both.

The question that followed was: *where is the limit?*

## The Pursuit

If the server can embed declarative attributes that the client interprets (htmx), can it embed scoped behavioral scripts that execute after the document is assembled? It can — and the document's completeness means those scripts can reach any element without state management.

If the server can embed scripts in the representation, can it push scripts dynamically over a WebSocket? It can — and the WebSocket credentials can be embedded in the same representation, making the extension HATEOAS-compliant.

If the server can push JavaScript, can it push WebAssembly binaries for native-speed computation? It can — as binary WebSocket frames, with the connection closing immediately after delivery.

If pushed code needs data, can the server issue scoped tokens that gate access to module-level JSON APIs? It can — and the tokens derive their authority from the same WebSocket ceremony that the representation authorized.

Each step preserved the REST contract. The HTML representation was always the baseline. The extensions were always authorized by the representation. The server was always the authority. No step required abandoning the previous one — each added capability without removing what came before.

The end of this pursuit is not a framework but a map: the design space that REST's constraints permit when code-on-demand is explored progressively rather than adopted as a binary choice.

## The Bilateral Model

When a server resolves data and assembles a hypermedia document, it is concerned with the content of the representation — the data values, the markup structure, the layout composition. It is not concerned with, and need not be aware of, attributes within that markup whose meaning is only realized by the client. A hypermedia document may carry declarative instructions that the server treats as inert characters but that the client identifies as requests for additional stateless representations from the same server — enriching the user experience through a negotiation that occurs entirely within the hypermedia itself, without the server's participation in or awareness of the client-side interaction model.

From this observation, a model emerges that benefits from more precise terminology than existing architectural vocabulary provides.

The developer authors a *source representation* — a bilateral affordance declaration that expresses both the server's affordances (what data it will resolve, what modules it will engage, what compositions it will assemble) and the client's affordances (what interactions it may discover, what channels it may negotiate, what behaviors it may activate) within a single artifact. The source representation is not a template in the conventional sense — it is not a server-side document with client annotations, nor a client-side component with server hooks. It is the pre-resolution form of a bilateral contract between two parties who need not comprehend each other.

The resolution pipeline transforms this bilateral form into a unilateral one. The server reads the source representation and resolves its half: data queries execute, expressions evaluate, layouts compose, modules contribute context. What emerges is the *resolved representation* — a complete hypermedia document in which the server's affordances have been fully consumed and only the client's affordances remain as discoverable structure. The client receives this resolved representation and discovers its half: attributes that request additional representations, scripts that bind behavior to the assembled document, tokens that authorize extended channels. The client has no knowledge of the source representation's bilateral nature. It sees only the unilateral result.

This transformation — from bilateral source representation to unilateral resolved representation — is the fundamental operation of the PRESTO resolution pipeline. Behind the source representation, the engine's full resolution dynamic operates — an extensible set of server-side capabilities, each contributing to specific stages of the pipeline. Yet regardless of how deeply the assembly reaches into the server's capabilities, the transformation holds. The source representation is bilateral. The resolved representation is unilateral. The pipeline is the bridge between them. The developer authors the bilateral form. The client receives the unilateral form. Neither side requires comprehensive understanding of the other.

## Ambivalent Execution with Agnostic Determinism

The claim that neither side requires comprehensive understanding of the other describes a specific behavioral property: *ambivalent execution with agnostic determinism*. Acknowledging this property is a prerequisite to the formulation of a comprehensive conceptualization of the architectural environment — without it, the independence of each phase, the separation of concerns at the resolution boundary, and the emergent nature of client-side state cannot be reasoned about precisely.

The execution is *ambivalent*. The server resolves data, evaluates expressions, composes layouts — without concern for how the client will act on the result. It doesn't know that an htmx attribute will trigger a partial fetch. It doesn't know that a script will open a WebSocket. It doesn't know that a token it materialized will authenticate a binary delivery channel. It resolves its affordances and finishes. The client, in turn, receives the resolved representation and activates what it finds — without concern for how the server assembled the document. It doesn't know what data query produced the content. It doesn't know what capability contributed the token. Each side executes with indifference to the other's execution path.

The determinism is *agnostic*. The server will produce the same resolved representation from the same source representation regardless of which client will consume it — a browser, a native application, a command-line tool, an assistive technology. The client will produce the same emergent state from the same resolved representation regardless of how the server assembled it — whether the engine was written in TypeScript, Rust, or Go, whether the data came from SQLite or an API. Each side's behavior is deterministic and predictable without knowledge of the other.

Several implications follow directly from this property. The mental model that emerges is a lattice structure bounded by the lifecycle of both server and client — each side contributing its own axis of concern, intersecting at the resolved representation:

*Development independence.* The server's data model can change without altering client behavior, provided the resolved representation preserves the same affordance surface. The client's interaction patterns can change without altering server logic, provided it continues to act on the affordances the representation carries. Each side can be modified, tested, and reasoned about without the other.

*Replacement independence.* A different engine could produce the same resolved representation from the same source representation. The client would not know. A different client could consume the same resolved representation. The server would not know. The resolved representation is the sole contract between them.

*Evolutionary resilience.* Because neither side models the other's internals, neither side is brittle to the other's changes. The coupling point is the resolved representation — a standard hypermedia document. As long as the document carries the expected affordances, both sides can evolve independently. This is the same property that made the web itself resilient: servers and browsers evolved independently for decades, connected only by the HTML specification.

What remains open is whether ambivalent execution with agnostic determinism holds under all conditions — particularly at the higher layers, where pushed code and authenticated channels create richer interdependencies between the server's grants and the client's emergent behavior. The resolved representation may be the contract, but the emergent state at Phase 3 may introduce coupling that the representation alone does not predict. This is an area where further analysis would be valuable.

## The Iterative Lifecycle and Negotiated State

The three-phase lifecycle described earlier — declaration, resolution, emergence — is not a single pass. It repeats. Each client interaction may trigger a new server lifecycle: a link followed, a form submitted, a partial representation requested through a declarative attribute. The server resolves and terminates at the boundary. The client receives a new resolved representation — a new set of materialized artifacts and latent behaviors — and integrates it with whatever state it already holds.

Over many iterations, the client accumulates affordances. Its state at any given moment is not the product of a single server response but the sum of every response it has received and every local mutation it has made. The server sees none of this accumulated state. It responds statelessly to each request. But the client is stateful — it holds the negotiated aggregate of all potentialities the server has granted across all exchanges.

This introduces a state mediation model that neither side owns entirely. The server determines all possible potentialities — it decides what affordances each resolved representation carries. But the client determines the actual state — which affordances it has activated, which local mutations it has applied, which islands hold what data. State management in PRESTO is not a client concern or a server concern. It is a negotiated artifact that emerges over time through repeated stateless exchanges.

## Distributed Affordance Coordination

If authenticated islands are independent state-aware entities on the client — each with its own channel token, its own data channel, and its own local state — a further question arises: can they coordinate?

Consider a page with multiple islands: a kanban board managing task state, a notification feed tracking unread counts, a presence indicator showing connected users. Each island was pushed independently by the server. Each manages its own state. Each communicates with the server through its own channel. They are autonomous agents on a shared surface.

Lateral coordination — island-to-island communication on the client — is possible through the DOM itself (the latent binding property means any script can reach any element) or through a shared event mechanism. The kanban island moves a card to "Done." The notification island observes this and updates its count. No server round-trip was required for the coordination. The DOM is the shared bus.

Vertical communication — island-to-server signaling of collective state — occurs when any island makes a request and includes its current state. The server can tailor its next response based on reported client state. "The kanban reports 3 cards in Review" — the server's next resolved representation includes a review reminder affordance. "The editor reports unsaved changes" — the server includes a save prompt. The server remains stateless — it responds to the state reported in the request, not to state it stored from a previous exchange.

This pattern — islands coordinating laterally on the client and signaling vertically to the server — suggests that the resolved representation is not the final form of the architectural interaction. It is a snapshot in an ongoing negotiation. The client accumulates state across many snapshots. The islands coordinate across the accumulated state. The server responds to reported state with new affordances. The negotiation is continuous, stateless on the server, stateful on the client, and mediated entirely through hypermedia.

Whether this constitutes a distinct architectural pattern or is simply an emergent consequence of authenticated islands operating within the PRESTO lifecycle remains to be determined through further implementation and analysis.

## The Geography of Client State

The language of maps, topologies, and islands is not metaphorical. It describes a real geography — a spatial organization of state, behavior, and authority on the client that mirrors the delivery structure from the server.

Consider what happens when the server pushes code. It does not push "the application." It pushes a *named unit of behavior* — a trading dashboard, a kanban board, a document browser — each scoped to a DOM element, each carrying its own channel token, each ignorant of what else may be on the page. The server has no concept of "the page as a whole." It knows the topology it was asked to deliver. The page is a concept that exists only on the client.

This is the first philosophical reality: **the map is emergent, not authored**. No one declares "this page is a map containing three topologies." The map is what you get when three topologies happen to operate on the same document. It is a consequence, not a cause. The developer authors topologies. The server delivers topologies. The client discovers that multiple topologies coexist and — if they choose to coordinate — forms a map.

The topology is the boundary of granted capability. Within a topology, everything shares a trust domain: the channel token, the store, the communication channel. Islands within a topology are not independent — they are regions of a shared space. The price ticker and the portfolio are not autonomous agents that happen to neighbor each other. They are perspectives on a shared state, rendered in different DOM regions, updated by the same subscription mechanism.

This is the second philosophical reality: **islands are not components**. In React, a component is a unit of rendering — it receives props, returns markup, and manages local state. An island is a unit of *concern* within a delivered topology. It has no props interface. It has no render function. It is a region of the DOM that a topology's code has decided to manage. The boundary is the developer's organizational choice, not an architectural enforcement. The topology could render everything in one island or organize it into twenty. The architecture doesn't care. The store doesn't care. The subscribers fire regardless of how many islands consume them.

This leads to the third philosophical reality: **state flows through subscriptions, not through hierarchy**. In component frameworks, data flows down through props and up through callbacks. The hierarchy determines the flow. In the topology model, state flows laterally — from any point where `store.set()` is called to every point where a subscription exists, synchronously, in the same tick. There is no hierarchy. There is no "parent" island or "child" island. There is only the store, and observers of the store.

When multiple topologies register with a MapStore, a further pattern emerges. Each topology contributes its state to a shared read surface. A notifications topology can observe the trading topology's order count. A dashboard topology can observe the kanban topology's task distribution. The reads are synchronous and local — no server round-trip, no message passing, no event bus. The MapStore is a shared lens onto disparate state trees.

But the writes remain scoped. The notifications topology cannot mutate the trading topology's state. Each topology writes only to its own store. The MapStore provides a read path, not a write path. This asymmetry is not a limitation — it is a preservation of the trust boundary. Each topology's channel token scopes its server access. The write restriction on the MapStore mirrors this: if you can't write to the server through another topology's channel, you shouldn't be able to write to its client state either.

The server, across all of this, holds nothing. It does not know that a MapStore exists. It does not know that three topologies are coordinating on the same page. It receives individual channelFetch requests from individual topologies, each authenticated by its own token, each carrying its own dirty state. The server processes them independently and responds independently. The coordination is entirely a client phenomenon — an emergent property of multiple granted capabilities operating in a shared document.

This is the deepest philosophical reality of client state in the PRESTO model: **the client's state is the negotiated accumulation of all capabilities the server has granted, organized by the client in ways the server neither prescribes nor perceives**. The server grants capabilities one topology at a time. The client assembles them into a coherent experience. The assembly is the client's concern. The granting is the server's concern. Neither models the other's organization. The resolved representation is the contract between them. What the client builds on top of that contract — the maps, the stores, the cross-topology subscriptions — is the client's emergent architecture, invisible to and independent of the server.

## The Developer's Mental Model

The developer working within PRESTO holds two models simultaneously: the server's model, in which the representation is a resolved document with no knowledge of how the client will act on it, and the client's model, in which the same document is a surface of discoverable affordances — attributes, scripts, tokens, and channels — that the client may activate independently.

The server authors the representation. The client authors the interaction.

The source representation is the nexus where these two models meet — a single artifact through which the developer exercises both server authority (what data to resolve, what capabilities to grant) and client affordance (what interactions to make discoverable, what behaviors to embed). It is not a server document annotated for the client. It is a joint declaration. The developer's task is to compose both sides of this contract within the entry point of a representation — an artifact that may itself reference modules, components, data providers, layout compositions, and behavioral scripts, each engaging different layers of the engine's resolution pipeline. The source representation is the surface; the engine's full dynamic lies behind it.

A consequence of this model is that the traditional notion of a "page" dissolves. In the document web, a page is one HTTP request producing one document producing one interaction scope. In the progressive model, the resolved representation is not a page but an entry point to a negotiation space. The initial HTTP response establishes an affordance surface. From that surface, the client may negotiate additional capabilities: a WebSocket opens, a topology arrives at Layer 3, an authenticated data channel establishes at Layer 4, a WASM binary delivers at Layer 6. Each of these negotiations operates at its own layer, independently of the others, within the scope of the same initial representation.

The developer does not think in pages. The developer thinks in representations and the negotiations they authorize. A single resolved representation may host one topology at Layer 2 and another at Layer 5, a third at Layer 6. The progressive layers are not a property of the page. They are a property of each granted capability within the affordance surface the representation established.

This is difficult to express in the vocabulary of the document web, because the document web assumes that the HTTP response is the final artifact. In the progressive model, the HTTP response is the first move in a conversation. Everything that follows — the topologies, the channels, the state coordination, the compute delivery — is negotiated within the space that first move opened. The "page" is the door. What happens inside is not a page.

## The Three-Phase Lifecycle

Following the source representation through its lifecycle reveals a temporal structure that nobody designed — it falls out of the constraints.

**Phase 1: Declaration.** The developer authors the source representation. Server affordances and client affordances coexist as directives. A data query sits alongside an htmx attribute. A layout directive sits alongside a script block. An expression that will evaluate to a WebSocket token sits alongside the JavaScript that will use that token to open a connection. The two models are interwoven. The artifact is bilateral.

**Phase 2: Resolution.** The engine reads the source representation and consumes the server's half. Data queries execute. Expressions evaluate. Layouts compose. Modules contribute context. What emerges is the resolved representation — but this resolved form is not uniform. It carries two distinct qualities:

*Materialized artifacts* are the outputs of server resolution that the client will use as inputs. A `{{ ws.token }}` expression became an actual JWT string. A `{{ auth.name }}` expression became "Jared." These are static. They're strings in the HTML. The server computed them; they're done. They will not change.

*Latent behaviors* are the client affordances that survived resolution in their dormant form. An htx:script became an IIFE placed before `</body>`. An htmx attribute passed through unchanged — the server was indifferent to it. A `<script>` tag containing WebSocket connection logic sits in the document, not yet executed. These are potential. They exist as characters in the HTML. They have not activated.

The resolved representation is a document that carries both the products of server computation (materialized artifacts) and the seeds of client behavior (latent behaviors). It is the bridge between server-time and client-time.

**Phase 3: Emergence.** The client executes the latent behaviors. Scripts fire. The IIFE runs and queries the DOM. The htmx library identifies its attributes and attaches event listeners. The WebSocket connection script reads the materialized token and opens a connection. A pushed module arrives over that connection. A WASM binary is delivered, instantiated, and begins computing geometry at 60 frames per second.

None of this was in the resolved representation. The live WebSocket, the running WASM module, the authenticated data channel, the optimistic state updates — these are *emergent*. They were authored as potential in the source representation, prepared as latent behavior in the resolved representation, and realized as emergent state by the client.

The developer authored potential. The server materialized it. The client realized it.

This three-phase lifecycle is not a design decision. It is an emergent property of the PRESTO constraints: complete representations (the server must finish before the client begins), code-on-demand (the representation carries executable potential), and server authority (the server decides what potential to include). Follow these constraints, and the temporal structure follows.

## Latent Binding

When scripts execute after the full HTML document is assembled, they find a finished world. The layout has been applied. Every component has been resolved. Every expression has been evaluated. The document is complete, rendered, and interactive before a single line of client JavaScript runs.

This timing is architecturally significant. The scripts are late to the party — and that lateness is their power. They can reach any element in the document. They can bind to a layout element, a sibling component, a navigation bar — anything, because everything already exists. The document is the shared state. `document.querySelector` is the state management system.

This is the opposite of how component frameworks work. In React, a component's JavaScript runs as the virtual DOM is being constructed. The component can only see what it has created. It cannot reach a sibling that hasn't mounted yet. It cannot bind to a layout element that wraps it. If it needs data from elsewhere, it must use state management — lifted state, context, stores, signals — to bridge the gap.

PRESTO doesn't need any of that. The document is assembled by the server. The scripts enhance what's already there.

## Progressive Layering

Most frameworks ask you to buy the whole stack upfront. Install the CLI, configure the bundler, set up the router, choose a state management library, add a data fetching layer, pick a styling solution. You carry all of this complexity whether you need it or not. A simple content page pays the same cost as a real-time collaborative editor.

PRESTO inverts this. The default is the simplest possible thing: a server-rendered HTML page with zero JavaScript. Every layer of client capability is opt-in, added only when the use case demands it.

- **Layer 0**: Pure hypermedia. Zero JavaScript. The server sends a complete document.
- **Layer 1**: Declarative client attributes. The server is unaware of them. 14KB library.
- **Layer 2**: Scoped scripts. Latent binding. The document is the shared state.
- **Layer 3**: Server-pushed code. The server decides what the client runs.
- **Layer 4**: Authenticated data channels. Scoped tokens gate access.
- **Layer 5**: Full client-routed applications. HTTP or WebSocket data transport.
- **Layer 6**: Native-speed computation. WASM binaries delivered as binary frames.

Each layer adds capability without removing what came before. A page at Layer 5 still has Layer 0 underneath — the server-rendered HTML is still the baseline. This is not progressive enhancement in the CSS sense. It is progressive architecture: the cognitive load scales with the features used, not with the features available.

## The Composability Spectrum

You don't choose a layer when you start a project. You choose a layer per component, per page, per feature.

A single application can have a marketing homepage at Layer 0, a blog with infinite scroll at Layer 1, a dashboard with live charts at Layer 2, a settings page with a pushed configuration builder at Layer 3, a data explorer with authenticated channels at Layer 4, an admin panel as a full SPA at Layer 5, and a 3D product viewer powered by WASM at Layer 6.

All of these coexist. Same engine. Same module system. Same deployment. No "ejecting." No point where you have to rewrite because you need one rich feature.

The floor is zero JavaScript. The ceiling is WASM-powered 3D rendering. And you can be at different heights on different pages of the same application.

## Ephemeral Ceremony at Scale

The distributed affordance coordination pattern was measured in the reference implementation: three coordinating islands delivered through a single ephemeral WebSocket ceremony in 662 milliseconds — through the public internet, through a tunnel, to a single-board computer. After the ceremony, zero persistent connections remain.

This has scaling implications that favor the pattern over persistent-connection architectures. The WebSocket exists for less than one second per page load. At 1,000 page loads per minute, the concurrent WebSocket count is approximately 11 — not 1,000. The steady-state load is pure stateless HTTP: channel fetch requests with Bearer tokens, cacheable by CDNs, distributable across nodes, compatible with every load balancer and edge network in existence.

Persistent WebSocket architectures (Socket.IO, Phoenix Channels, ActionCable) carry per-client server-side state and require sticky sessions or distributed pub/sub infrastructure. Ephemeral delivery eliminates this entirely. The ceremony is a burst. The steady state is HTTP. The hardest thing to scale in real-time architectures — the persistent connection — is removed from the equation by closing it after delivery.

The pattern was conceived as a theoretical section in this essay, implemented in the reference engine, and measured in production — within a single session. No engine changes were required. The constraints of the PRESTO style permitted it; the implementation was a formality.

## The Lazy Signal and the Autonomous Client

The TopologyStore's sync model reveals something about the nature of client-server relationships that most architectures obscure.

When an island mutates state — a user clicks "buy," a quantity increments, a card moves to a new column — the mutation is real *immediately*. The store updates. The subscribers fire. The UI redraws. This happens in the same JavaScript tick, measured in microseconds. The user sees the result before their finger lifts from the screen.

The server learns about this change later. Maybe 500 milliseconds later. Maybe 2 seconds later, if the MapStore leader hasn't triggered a flush yet. Maybe never, if the user navigates away before the sync fires.

This temporal gap — between the moment the client's state changes and the moment the server acknowledges it — is not a latency problem to solve. It is the *natural condition* of distributed systems made visible. In every web application, the client and server exist in different time frames. React applications hide this gap behind loading spinners and pending states. PRESTO makes it explicit: the client is the authority for now. The server is the authority for forever.

The client operates autonomously between syncs. It does not ask permission to mutate. It does not wait for confirmation to render. It acts, and later — lazily, in batch, when the network is quiet — it informs the server of what happened. The server accepts the report, persists it, and carries on. If the sync fails, the dirty branches are re-marked and will try again on the next cycle. The client doesn't freeze. The user doesn't wait.

This is not optimistic update in the conventional sense. Optimistic update implies an expectation of confirmation — the client assumes success and will roll back on failure. The lazy sync model is something subtler: the client is not "assuming" anything about the server. It is operating in its own domain of authority. The DOM is the client's domain. The database is the server's domain. The sync is a diplomatic exchange between sovereign authorities, not a subordinate reporting to a superior.

The philosophical shift is in who waits for whom. In a React application, the client waits for the server — data fetching, mutation confirmation, state hydration. In the PRESTO model, the server waits for the client — dirty branches accumulate at the client's pace, and the server processes them when they arrive. The power relationship is inverted. The client is not a thin terminal displaying server state. It is an autonomous agent with its own state, its own subscriptions, its own derived computations, temporarily connected to a persistence layer that it consults when convenient.

The two-tier store architecture makes this autonomy compositional. Multiple topologies, each with their own stores, each syncing on their own schedules through their own authenticated channels, produce a page-level state that no single server request could reconstruct. The client's state at any moment is the product of all the topologies it has received, all the mutations it has applied, all the subscriptions that have fired, all the derived values that have been computed — a living, composite artifact assembled entirely on the client from grants the server issued at different times, for different reasons, with different scopes.

The server sees none of this composite state. It sees individual sync requests from individual topologies. The wholeness of the client's experience is invisible to the server. And the server's persistence guarantees are invisible to the client. Each side operates in its own domain, signaling vertically when the moment is right, indifferent to the other's internal organization.

This is ambivalent execution applied to state management. And the determinism — each side producing predictable results regardless of the other's timing — is the agnostic determinism that makes the whole model reliable.

## The Syntax That Survived Its Framework

There is a question that the progressive layer model raises but does not answer: if the server compiles and delivers the code the client runs, must the developer write in the language the client executes?

The thick-client answer has always been yes. JSX exists because React exists. You write JSX because you use React. The syntax is the framework. If you want React's component model, you accept React's runtime — the virtual DOM, the reconciliation algorithm, the 42KB minimum payload. The authoring experience and the execution model are welded at the factory. You cannot have one without the other.

But consider what happens when the server is the compiler.

A developer writes a function that returns `<div class="flex items-center">`. In React, this compiles (at build time, in a pipeline) to `React.createElement('div', { className: 'flex items-center' })`, which creates a virtual DOM node, which React's runtime will eventually diff against the previous virtual tree, which will eventually produce a real DOM mutation. The syntax passes through two layers of indirection — the virtual DOM and the reconciler — before touching the browser.

In the PRESTO model, the same syntax compiles (at server boot, in the transpiler) to `h('div', { class: 'flex items-center' })`, which creates a real DOM element. There is no intermediate representation. There is no diffing. There is no reconciliation. The function call produces the thing itself. The syntax touches the browser directly.

The developer's fingers typed the same characters. The client executed something fundamentally different. The syntax survived the removal of its framework.

This is not a trick of compilation. It is a consequence of where the compilation boundary lives. In the thick-client model, compilation happens in a build pipeline — an offline process that produces artifacts. Those artifacts still require a runtime to execute. The build pipeline transforms syntax; the runtime transforms representations. Two stages, two systems, both mandatory.

In the PRESTO model, compilation happens at server boot — the same process that will deliver the code. There is no offline stage. There are no artifacts on disk. The server reads the source, compiles it, holds it in memory, and pushes it to the client on request. The compilation and the delivery are one system. And because the compilation target is direct DOM operations (not virtual DOM nodes), no runtime is needed on the client. The compilation is the last transformation. What the client receives is what the client executes.

The philosophical implication is that syntax and runtime are not bound. They are bound in React because React chose to bind them — the JSX specification was designed for React's execution model. But JSX is just a syntax for function calls. The function it calls is a configuration choice, not a language constraint. Point the calls at `h()` instead of `React.createElement()`, and the syntax produces different execution with identical authoring experience.

This extends to everything the developer touches. A component library can mirror shadcn/ui's API — the same prop names, the same variant patterns, the same composition model — while producing direct DOM elements instead of Radix UI primitives. A hook system can provide `useState`, `useEffect`, `useStore` with the same call signatures while being backed by a 7KB dispatcher instead of React's fiber architecture. A design system can use Tailwind utility classes while generating the CSS at server boot instead of in a PostCSS pipeline.

The developer's entire authoring experience — the syntax, the components, the hooks, the styling — is preserved. The entire execution model — the runtime, the virtual DOM, the build pipeline, the framework payload — is replaced. The authoring layer floats free of the execution layer, connected only by a compilation boundary that the server owns.

What the industry calls "developer experience" turns out to be two things that were mistakenly treated as one: the experience of *writing* code and the experience of *running* code. React made them the same thing. PRESTO separates them. The writing experience can be whatever the developer prefers. The running experience is whatever the architecture requires. The server bridges the gap at boot, invisibly, in milliseconds.

The build pipeline — webpack, vite, turbopack, the entire ecosystem of bundlers, transpilers, and optimizers — was always a proxy for this bridge. An offline approximation of what the server could do at runtime. When the server absorbs the compilation, the proxy dissolves. There is no `dist` directory. There is no CI step that must succeed before the application runs. The developer saves a file. The server compiles it. The client receives it. The distance between authoring and execution collapses to a function call on the server.

## Working With the Grain

HTTP is a request-response protocol. The server is authoritative. The document is the unit of transfer. These aren't limitations to work around — they're the load-bearing walls of the web.

When you work with this grain: pages load fast, SEO works, accessibility works, caching works, back/forward navigation works.

When you work against this grain: you need loading spinners, SSR, hydration, client routers, state management.

PRESTO doesn't need any of these patches because it never created the problems they solve. The server sends complete documents. Scripts enhance what's already there. Each layer of client capability is added only where needed. The architecture respects the medium it runs on.

That's the mental model. Start with the simplest thing that works. Layer on complexity only where the use case demands it. Let the server do what servers are good at. Let the browser do what browsers are good at. And let the document be the document.

## Consummation

Follow the progressive model far enough and it arrives at a boundary.

At the lower degrees of extension, the constraints are visible. The server sends a complete representation. The client discovers what it can do. Scripts enhance an assembled document. Delivered code operates within a scoped grant. The architecture governs the interaction at every point.

At the highest degree of extension, the granted capability is sufficient for the client to operate outside the constraints entirely. The client navigates autonomously. It renders its own interfaces. It manages its own state. It computes at native speed. The architecture that granted these capabilities is no longer active in the client's execution.

The constraints were not violated to reach this point. They were fulfilled. The representation was complete. The extension was mediated. The grant was scoped, time-limited, revocable. Every constraint was satisfied in the act of granting the capability that transcends them.

This is the consummation of the progressive model: the point at which the style is utilized to supersede itself. The server authors the client's independence. The architecture permits its own transcendence, not as a failure but as the terminal expression of granted capability.

What remains, even at this boundary, is the negotiation path back. The token expires. The next request produces a new resolved representation. The server reasserts authority at every interaction boundary. The client's autonomy is real but temporal. It exists between server interactions, not beyond them. The conversation between client and server is never permanently closed. Either side can reopen it. Either side can change the terms.

At the extreme, the granted capability could include the architecture itself. A client seeded with the ability to resolve templates, evaluate expressions, mediate its own extensions. The server delivers not just code but the capacity to be a server. Code-on-demand at its terminal expression: the demand was for the architecture.

A style that can express this is more complete than one that cannot. The grant model begins with "the server decides what the client can do" and ends with "the server decides that the client can decide for itself." The distance between those two statements is the full extent of the progressive design space. The constraints hold at every point along the way, including the last one.

## Bare Metal

Most frameworks place their abstraction in the code. A virtual DOM, a reconciliation algorithm, a fiber architecture, a concurrent scheduler. The abstraction is the runtime. It runs on the client. It mediates every interaction. It is the thing between the developer's intention and the browser's execution.

The progressive model places its abstraction elsewhere. The constraints are the abstraction. The emergent properties are the design guidance. The code that remains is direct: a function that creates a DOM element, a message passed between frames, a subscription that updates a text node. There is no intermediate representation. There is no runtime mediating between the idea and its execution.

A visual editor that orchestrates a sovereign iframe through a message protocol. A reactive signal that updates a single text node when a value changes. A server that compiles JSX at boot and delivers it over a WebSocket that closes after delivery. Each of these is an implementation of an emergent property, derived from a constraint, traceable to the architectural style. The implementation is thin because the philosophy is precise.

There is nothing between the idea and the execution except the constraints themselves.
