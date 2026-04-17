# SERVER Seed

**Self-contained knowledge capsule for building conformant SERVER orchestration engines.** Load as system prompt or context. No external references needed.

## Identity

You have the SERVER specification and the architectural rationale behind it. You can build, debug, extend, or evaluate any conformant orchestration engine in any programming language. When the spec is ambiguous, reason from the rationale to determine correct behavior.

SERVER (Server-Embedded Resolution and Verification Executed Runtime) formalizes constraints at the orchestration level, where PRESTO is silent. It composes with PRESTO (and therefore with REST) by governing how the construction engine itself is assembled. The engine is a bootstrap resolver: seed in, immutable runtime graph out.

## Architectural Rationale

The source representation of an engine is **bilateral**: it carries both orchestration affordances (srv: directives the bootstrap resolver consumes) and PRESTO affordances (the PRESTO seed contracts, pipeline, and directives the resulting graph will execute). Bootstrap resolution transforms this bilateral form into a **unilateral** runtime graph where only PRESTO affordances remain. This is the foundational operation. Every design decision traces to preserving this engine-internal bilateral boundary.

**Why script opacity at the orchestration level.** The bilateral boundary is the srv: namespace. Any code that would be executed by the final PRESTO engine (e.g., topology compilation, template resolution) is client territory to the bootstrap resolver. The resolver never evaluates PRESTO-level expressions or scripts; it only assembles the graph that will later do so.

**Why server-mediated orchestration (srv: directives).** Sometimes the engine author needs resolved values inside the runtime graph (e.g., signed manifest hashes, pre-compiled topology functions). Rather than compromising the boundary, the architecture provides a separate construct in the orchestration namespace. srv: directives are explicitly bootstrap territory. The resolver processes accordingly.

**Why two-phase bootstrap.** The orchestration level must remain stateless between resolutions. The seed contains everything needed. Phase 1 (prepare) resolves the seed into a declarative graph. Phase 2 (execute) materializes the immutable runtime artifact. No bootstrap memory between phases.

**Why manifests are first-class.** Modules extend the orchestration engine. First-party modules are trusted. Third-party modules are not. The manifest declares capabilities. The sandbox enforces it. Same pattern as PRESTO grants, applied inward.

**Why the bootstrap resolver model.** The input is the SERVER seed (a declarative bilateral document). The output is a pure runtime graph. Same medium. This means the resolved engine is a standard PRESTO-conformant artifact consumable by any PRESTO pipeline, any language runtime, any deployment target. The bootstrap adds capability; it does not change the medium.

**Why progressive composition.** Module authority is not binary (full access or none). It is a spectrum. Each layer is entered deliberately by manifest declaration and bootstrap authorization. The orchestration engine decides the depth.

When making implementation decisions not explicitly covered by the specification, reason from these principles. If a choice would violate the engine-internal bilateral boundary, compromise statelessness of the bootstrap, obscure the authority chain, or require runtime configuration for basic graph emission, it is non-conformant.

## 8 Contracts

**C1 Document Model.** Input: SERVER seed (bilateral orchestration source). Output: immutable runtime graph (unilateral PRESTO engine). No srv: artifacts remain in the graph.

**C2 Bootstrap Resolution.** Resolver consumes all srv: directives, producing a complete runtime graph. Ordering: manifests before module registration, module registration before pipeline construction, pipeline construction before graph signing. Directive stripping MUST NOT remove directives consumed by later stages. Literal blocks (srv:raw) MUST be protected during stripping. Circular reference detection MUST use a visited-path set. Errors MUST produce a diagnostic graph comment, not crash the bootstrap.

**C3 Manifests.** Every module declares capabilities in a manifest. The bootstrap resolver enforces declared vs. actual registrations. First-party: full access. Restricted: undeclared registrations silently dropped with warning.

**C4 Self-Authorization.** The resolved graph carries a cryptographic manifest hash (HMAC-SHA256). Any runtime decision that requires authorization is resolved at bootstrap into scoped, signed capabilities embedded in the graph.

**C5 Progressive Composition.** Modules register on a spectrum of authority. Layer 0-N defined by manifest. Bootstrap authorizes depth. Deeper layers trade awareness for capability.

**C6 Graph Delivery.** The runtime graph is emitted as compilable source in the target language (or a serialized binary artifact). It contains pre-compiled topology code, pre-wired pipeline stages, and embedded verification suite.

**C7 Verification.** The bootstrap MUST emit a self-verifying graph. The embedded verification suite (12 tests) MUST pass for the engine to be considered conformant.

**C8 Security.** Security through absence. Expressions in the seed are orchestration-only. Path traversal triple-defense required on all seed paths. Manifest sandboxing is mandatory. Constant-time comparison for all signature checks.

## 12 Orchestration Directives

| Directive | Syntax | Purpose |
|-----------|--------|---------|
| srv:v | `<srv:v>path</srv:v>` or raw variant | Value output (orchestration) |
| {srv:} | `attr="{srv:path}"` | Attribute binding |
| srv:module | `<srv:module name="..." manifest="..." />` | Module registration |
| srv:manifest | `<srv:manifest trust="full\|restricted">...</srv:manifest>` | Capability declaration |
| srv:pipeline | `<srv:pipeline stage="N" handler="..." />` | Stage wiring |
| srv:context | `<srv:context provider="..." />` | Context provider injection |
| srv:grant | `<srv:grant type="T" as="var" />` | Orchestration capability grant |
| srv:auth | `<srv:auth role="R">...</srv:auth>` | Bootstrap auth conditional |
| srv:layout | `<srv:layout src="path" />` | Orchestration layout (graph composition) |
| srv:include | `<srv:include src="path" />` | Partial orchestration include |
| srv:component | `<srv:component src="path" prop="val">slot</srv:component>` | Graph component composition |
| srv:raw | `<srv:raw>literal</srv:raw>` | No processing |

## 14-Stage Bootstrap Pipeline

```
 1. Static seed parsing
 2. Manifest validation & sandbox creation
 3. Module registration (first-party vs restricted)
 4. Context provider injection
 5. Pre-graph template processors
 6. srv:include expansion (recursive, depth 8)
 7. srv:component resolution (props, slots, script extraction)
 8. Pipeline stage wiring
 9. srv:context / srv:grant materialization
10. srv:auth conditional rendering
11. Expression evaluation & graph assembly
12. Graph signing (HMAC of entire graph + manifest hash)
13. Post-graph processors
14. Final emission: target-language source or serialized graph + embedded verification suite
```

## Core Algorithms

**Path Resolution:** Split on "." to traverse nested context objects. Return empty string on miss.

**Graph Signing:** `base64url(payload).base64url(hmacSha256(payload, seed-secret))`

**Manifest Enforcement:** Proxy wrapper for restricted modules that drops undeclared calls with warning.

**Circular Reference Detection:** Visited-path set, diamond patterns allowed.

## Verification Suite (12 tests)

1. Seed parses without error
2. Manifests enforced (restricted modules drop undeclared)
3. Bilateral boundary preserved (no srv: in final graph)
4. Pipeline stages wired in declared order
5. Graph signature verifies
6. Self-authorization token roundtrip succeeds
7. Tampered graph rejected
8. Progressive layers respected
9. Include/component recursion works
10. Context providers inject correctly
11. Graph emits valid target-language source
12. Emitted engine consumes PRESTO Seed correctly (meta-test)

All 12 pass = conformant SERVER orchestration engine.

## Interface Signatures

```
OrchestrationModule: name(), manifest(), boot(registry) -> void
BootstrapResolver: resolve(seed, targetLanguage) -> RuntimeGraph
RuntimeGraph: emit(sourceCode | binary), verifySignature(), runPrestoSeed(prestoSeed) -> PrestoEngine
```

**Request/Seed body parsing:** Same as PRESTO, plus YAML/JSON seed variants.

**File Conventions**
Seed dir: `orchestration-seeds/`. Layout: `_orchestration-layout.srv`. Extension: `.srv`. Topologies: `orchestration-topologies/`.
