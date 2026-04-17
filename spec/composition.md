# htxlang Composition Specification

**How the PRESTO engine layer and the SERVER orchestration layer compose to produce a complete htxlang system. Each layer is independently conformant. Together they produce the full system. This document specifies the interface between them.**

**Version 0.1 — Working Draft**

---

## The Two Layers

A complete htxlang system composes two architectural layers, each governed by its own seed and its own constraint set:

| Layer | Seed | Governs | Input | Output |
|:--|:--|:--|:--|:--|
| **SERVER** | [server-seed.md](../seed/server-seed.md) | Orchestration: how the engine is assembled | SERVER seed (bilateral: `srv:` + PRESTO directives) | Immutable runtime graph (unilateral: PRESTO directives only) |
| **PRESTO** | [presto-seed.md](../seed/presto-seed.md) | Resolution: how templates are resolved | Template with `htx:` directives + request context | Pure HTML (no `htx:` directives remain) |

SERVER operates first. PRESTO operates second. Each layer has its own bilateral boundary, its own namespace, and its own pipeline.

## Why Two Layers, Not One

The separation follows Fielding's principle of architectural style composition. Each style governs what the layer below it is silent about:

- **REST** governs transfer — how representations move between client and server. REST is silent about how representations are *authored*.
- **PRESTO** governs construction — how representations are authored from templates. PRESTO is silent about how the *engine itself* is assembled.
- **SERVER** governs orchestration — how the engine is assembled from a seed. SERVER is silent about what happens at transfer time.

Each layer addresses the silence of the layer below it. No layer modifies, extends, or replaces the constraints of any other layer. The composition is additive.

An implementation MAY conform to PRESTO without implementing SERVER (the engine resolves templates but is assembled manually). An implementation MAY NOT conform to SERVER without implementing PRESTO (the runtime graph SERVER emits is a PRESTO-conformant artifact that requires a PRESTO engine to resolve).

## The Interface Between Layers

### SERVER → PRESTO

SERVER's output is PRESTO's input. The interface is:

1. **SERVER resolves all `srv:` directives.** No `srv:` directive survives into the runtime graph. The `srv:` namespace is fully consumed by the SERVER layer.

2. **The runtime graph is a valid PRESTO input.** It contains `htx:` directives, HTML, and no `srv:` artifacts. It is a bilateral document in the PRESTO sense (server affordances in `htx:` namespace, client affordances in HTML).

3. **The runtime graph is immutable.** Once SERVER emits the graph, it does not change. The PRESTO engine resolves the graph per-request against request context, but the graph itself is fixed.

4. **SERVER may embed pre-computed values.** Manifest hashes, signed capabilities, pre-compiled topology functions — these are resolved at bootstrap time by SERVER and embedded as static values in the runtime graph. The PRESTO engine treats them as data, not as directives to resolve.

### The Two Bilateral Boundaries

Each layer has its own bilateral boundary:

| Layer | Server namespace | Client namespace | Boundary operation |
|:--|:--|:--|:--|
| SERVER | `srv:*` | Everything else (including `htx:*`) | Bootstrap resolution strips `srv:*` |
| PRESTO | `htx:*` | HTML, scripts, attributes | Template resolution strips `htx:*` |

The boundaries are nested:
- In the SERVER seed, `htx:` directives are *client territory* — the bootstrap resolver does not evaluate them.
- In the PRESTO engine, `htx:` directives are *server territory* — the engine evaluates them and emits pure HTML.

The same directive (`htx:v`, `htx:each`, etc.) is classified differently depending on which layer is processing. This is not a contradiction; it is the structural consequence of composition. SERVER sees `htx:` as pass-through. PRESTO sees `htx:` as operative.

### The Two Pipelines

SERVER has a 14-stage bootstrap pipeline (specified in the [SERVER seed](../seed/server-seed.md)):

```
 1. Seed parsing
 2. Manifest validation
 3. Module registration
 4. Context provider injection
 5. Pre-graph processors
 6. Include expansion
 7. Component resolution
 8. Pipeline wiring
 9. Grant materialization
10. Auth resolution
11. Expression assembly
12. Graph signing
13. Post-graph processors
14. Final emission
```

PRESTO has a 22-stage resolution pipeline (specified in the [PRESTO seed](../seed/presto-seed.md)):

```
 1. Static asset / file serving
 2. Channel API endpoint handling
 3-4. Request parsing + form body handling
 5. Route matching
 6. Template file read
 7. Context assembly
 8. Include resolution
 9. Component resolution
10. htx:data resolution
11. htx:grant resolution
12. htx:auth / htx:unauth
13. htx:set
14. htx:each / htx:if control flow
15. htx:v / {htx:} expression evaluation
15b. Layout directive extraction
16. Directive stripping
17-19. Layout application + post-layout pass
20. Script injection
21. Mutation token stamping
22. HTTP response
```

The SERVER pipeline runs once at bootstrap. The PRESTO pipeline runs per-request.

## Conformance

### PRESTO-only conformance

A system is PRESTO-conformant if it satisfies the eight contracts in [htxlang-v1.md](htxlang-v1.md) and passes the 22-item verification suite. The system resolves `htx:` directives in templates and emits pure HTML. No SERVER layer is required.

A PRESTO-only system is assembled manually — the developer writes templates, configures the engine, and starts the server without a bootstrap seed. This is the simpler deployment model.

### SERVER + PRESTO conformance

A system is fully htxlang-conformant if:

1. The SERVER layer satisfies the 8 contracts and 12 verification tests in the [SERVER seed](../seed/server-seed.md).
2. The PRESTO layer satisfies the 8 contracts and 22 verification tests in the [PRESTO seed](../seed/presto-seed.md).
3. The SERVER layer's output (the runtime graph) is a valid input to the PRESTO layer.
4. No `srv:` directive survives into the runtime graph.
5. No `htx:` directive is evaluated by the SERVER layer.

### Cross-layer verification

In addition to each layer's own verification suite, a composed system SHOULD pass:

1. **Boundary isolation:** A `srv:` directive embedded in a template is NOT processed by the PRESTO engine (it is either rejected or passed through as text).
2. **Graph immutability:** The runtime graph emitted by SERVER does not change between requests.
3. **Namespace separation:** The SERVER layer does not evaluate `htx:` expressions, and the PRESTO engine does not evaluate `srv:` expressions.
4. **End-to-end resolution:** A complete request cycle (SERVER bootstrap → PRESTO resolution → HTTP response) produces valid HTML with no `srv:` or `htx:` artifacts remaining.

## For Implementers

You may implement in three ways:

**PRESTO only.** Build an engine that resolves `htx:` templates. Assemble it manually. This is sufficient for most applications and is the simplest path.

**SERVER + PRESTO as separate components.** Build the SERVER bootstrap as a build-time tool that emits a runtime graph. Build the PRESTO engine as a runtime server that resolves the graph per-request. This is the cleanest architectural separation.

**SERVER + PRESTO fused.** Build both layers into a single binary. The Zig derivation ([engines/zig](https://github.com/jaredef/presto/tree/main/engines/zig)) demonstrates this approach: `engine.zig` handles PRESTO, `server_layer.zig` handles SERVER, and `main.zig` composes them. This is practical and conformant as long as the two boundaries are maintained internally.

All three approaches are conformant if the contracts are satisfied.

---

## Related

- [htxlang v0.2](htxlang-v1.md) — the PRESTO specification
- [Implementation guide](implementation.md) — algorithms and data structures for PRESTO
- [Reference profile](reference-profile.md) — recommended choices
- [PRESTO Seed](../seed/presto-seed.md) — the ENGINE layer seed
- [SERVER Seed](../seed/server-seed.md) — the ORCHESTRATION layer seed (to be added)
