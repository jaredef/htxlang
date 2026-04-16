# htxlang

**The specification for htxlang — a template language and resolution model for hypermedia-native web applications.**

htxlang extends REST by formalizing code-on-demand as a progressive spectrum. The engine is a resolver: HTML in, pure HTML out. The bilateral boundary — the `htx:` namespace — separates server affordances from client affordances. Resolution transforms a bilateral representation into a unilateral one where only client affordances remain.

This repository contains the **specification** — what htxlang IS. It is not the implementation. Conformant engines can be built in any language from these documents.

---

## Specification

| Document | Purpose |
|:--|:--|
| [spec/plan.md](spec/plan.md) | Master plan — scope, audience, and relationship to PRESTO |
| [spec/htxlang-v1.md](spec/htxlang-v1.md) | **The specification (v0.2 working draft)** — eight contracts a conformant engine must satisfy |
| [spec/implementation.md](spec/implementation.md) | Implementation guide — algorithms, data structures, exact behaviors |
| [spec/reference-profile.md](spec/reference-profile.md) | Reference profile — recommended choices (SHOULD per RFC 2119) |

## Supporting Documents

| Document | Purpose |
|:--|:--|
| [seed/presto-seed.md](seed/presto-seed.md) | Self-contained knowledge capsule — feed to any resolver to derive a conformant engine |
| [docs/architecture.md](docs/architecture.md) | PRESTO architectural rationale — why the bilateral boundary, why progressive layers |
| [docs/thinking-in-presto.md](docs/thinking-in-presto.md) | Mental model for reasoning about PRESTO systems |

## Key Concepts

**Bilateral boundary.** The source representation carries both server affordances (`htx:` directives the engine consumes) and client affordances (HTML the browser interprets). Resolution strips the server affordances, producing pure HTML. The boundary is absolute.

**Progressive layers.** Code-on-demand is not binary. Layer 0 is pure HTML. Layer 6 is native-speed computation. Each layer is independently adoptable. The architecture does not force a global choice.

**Resolver model.** Input: HTML. Output: HTML. Same medium. The engine adds capability without changing the medium. No client-side framework is required to render the output.

**The seed.** The [PRESTO seed](seed/presto-seed.md) is a ~2,200 word prose specification. Feed it to any frontier language model. The model derives a conformant engine. This has been validated across six languages and eight resolvers.

## Conformance

A system is htxlang-conformant if it satisfies the eight contracts in [spec/htxlang-v1.md](spec/htxlang-v1.md). The contracts use RFC 2119 keywords (MUST, SHOULD, MAY).

## Reference Implementations

- [presto-ts](https://github.com/hypermediacms/presto-ts) — TypeScript/Bun reference engine (canary)
- [jaredfoy.com](https://jaredfoy.com) — live site running presto-ts, serving the RESOLVE corpus

## Related

- [RESOLVE corpus](https://jaredfoy.com) — the broader framework htxlang emerges from
- [The Derivation Inversion](https://jaredfoy.com/doc/247-the-derivation-inversion) — the method by which htxlang's constraints were identified
- [The Seed Garden](https://jaredfoy.com/garden) — empirical demonstrations of constraint-first derivation

## License

MIT

---

*htxlang.com — Jared Foy, Southern Oregon*
