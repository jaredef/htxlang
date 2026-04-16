// Minimal spec site server for htxlang.org
// Serves markdown files rendered to HTML with a clean spec-document aesthetic

import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve, join } from "node:path";

const PORT = 3002;
const ROOT = import.meta.dir;

function renderMarkdown(md: string): string {
  const result = spawnSync("cmark-gfm", ["--extension", "table", "--extension", "autolink", "--unsafe"], {
    input: Buffer.from(md),
    stdout: "pipe",
    stderr: "pipe",
  });
  return result.stdout.toString("utf-8");
}

function wrapHtml(title: string, body: string, currentPath: string): string {
  const navLinks = [
    { href: "/", label: "Home" },
    { href: "/spec", label: "Specification" },
    { href: "/spec/implementation", label: "Implementation" },
    { href: "/spec/reference-profile", label: "Reference Profile" },
    { href: "/seed", label: "Seed" },
  ];
  const navHtml = navLinks.map(l =>
    `<a href="${l.href}" class="nav-link${currentPath === l.href ? ' nav-active' : ''}">${l.label}</a>`
  ).join("\n      ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} — htxlang</title>
<meta name="description" content="The specification for htxlang — a template language and resolution model for hypermedia-native web applications.">
<meta property="og:title" content="${title} — htxlang">
<meta property="og:description" content="HTML in, pure HTML out. The bilateral boundary. Progressive layers. Resolver model.">
<meta property="og:type" content="website">
<script>
  (function(){var t=localStorage.getItem('theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t)}else if(window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches){document.documentElement.setAttribute('data-theme','light')}})();
</script>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
<style>
  :root {
    color-scheme: dark;
    --bg-primary: #1f1f1f; --bg-secondary: #1a1d1e; --bg-code: #272822; --bg-hover: rgba(255,255,255,0.04);
    --text-primary: #c7c4c1; --text-heading: #e0ddd9; --text-body: #c7c4c1; --text-muted: #8a8785; --text-dim: #666;
    --border: #41464b; --border-subtle: rgba(255,255,255,0.08);
    --accent: #5b96d5; --accent-underline: rgba(91,150,213,0.3);
    --nav-link: rgba(199,196,193,0.6); --nav-link-hover: rgba(199,196,193,0.85);
    --font-body: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
    --font-code: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  }
  html[data-theme="light"] {
    color-scheme: light;
    --bg-primary: #ffffff; --bg-secondary: #f6f6f6; --bg-code: #f5f5f5; --bg-hover: rgba(0,0,0,0.03);
    --text-primary: #333; --text-heading: #111; --text-body: #333; --text-muted: #666; --text-dim: #999;
    --border: #d0d0d0; --border-subtle: rgba(0,0,0,0.08);
    --accent: #3366cc; --accent-underline: rgba(51,102,204,0.3);
    --nav-link: rgba(0,0,0,0.5); --nav-link-hover: rgba(0,0,0,0.8);
  }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: var(--font-body); background: var(--bg-primary); color: var(--text-body); line-height: 1.7; min-height: 100vh; -webkit-font-smoothing: antialiased; }

  /* ── Hero ── */
  .hero { padding: 2rem 0 1.5rem; }
  .hero h1 { font-size: 2rem; font-weight: 800; margin-bottom: 0.5rem; }
  .hero-sub { font-size: 1rem; color: var(--text-muted); margin: 0.25rem 0; }
  .hero-pitch { font-size: 0.9rem; color: var(--text-dim); margin-top: 0.5rem; }

  /* ── Concept cards ── */
  .concepts { display: grid; grid-template-columns: 1fr; gap: 1rem; margin: 2rem 0; }
  .concept-card { padding: 1.25rem; border: 1px solid var(--border-subtle); border-radius: 6px; background: var(--bg-secondary); }
  .concept-card h3 { color: var(--accent); font-size: 0.95rem; margin: 0 0 0.5rem; }
  .concept-card p { font-size: 0.85rem; color: var(--text-body); margin: 0 0 0.75rem; line-height: 1.6; }
  .concept-card a { font-size: 0.82rem; }

  /* ── Engine grid ── */
  .engine-grid { display: grid; grid-template-columns: 1fr; gap: 0.75rem; margin: 1.5rem 0; }
  .engine-card { display: flex; gap: 1rem; padding: 1rem; border: 1px solid var(--border-subtle); border-radius: 6px; text-decoration: none; color: var(--text-body); transition: border-color 0.15s, background 0.15s; }
  .engine-card:hover { border-color: var(--accent); background: var(--bg-hover); }
  .engine-icon { width: 2.5rem; height: 2.5rem; display: flex; align-items: center; justify-content: center; background: var(--bg-secondary); border-radius: 4px; font-weight: 700; font-size: 0.85rem; color: var(--text-heading); flex-shrink: 0; font-family: var(--font-code); }
  .engine-info { flex: 1; min-width: 0; }
  .engine-lang { font-weight: 600; font-size: 0.92rem; color: var(--text-heading); }
  .engine-meta { font-size: 0.75rem; color: var(--text-dim); margin: 0.15rem 0; }
  .engine-lines { color: var(--text-muted); }
  .engine-desc { font-size: 0.78rem; color: var(--text-muted); line-height: 1.4; }

  /* ── CTA section ── */
  .cta-section { margin: 3rem 0 1rem; padding: 2rem; border: 1px solid var(--border-subtle); border-radius: 8px; background: var(--bg-secondary); text-align: center; }
  .cta-section h2 { border-bottom: none; margin-top: 0; text-align: center; }
  .cta-section p { font-size: 0.9rem; max-width: 520px; margin: 0.75rem auto; }
  .cta-buttons { display: flex; flex-wrap: wrap; gap: 0.75rem; justify-content: center; margin-top: 1.25rem; }
  .cta-primary { background: var(--accent); color: #fff; padding: 0.55rem 1.5rem; border-radius: 5px; text-decoration: none; font-weight: 600; font-size: 0.88rem; }
  .cta-primary:hover { opacity: 0.9; }
  .cta-secondary { border: 1px solid var(--border); color: var(--text-muted); padding: 0.55rem 1.25rem; border-radius: 5px; text-decoration: none; font-size: 0.85rem; }
  .cta-secondary:hover { border-color: var(--accent); color: var(--text-heading); }

  /* ── Engine page ── */
  .breadcrumb { font-size: 0.8rem; color: var(--text-dim); margin-bottom: 1rem; }
  .breadcrumb a { color: var(--text-muted); }
  .engine-page-meta { font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1rem; }

  /* ═══════════════════════════════════════════════
     MOBILE FIRST — base styles are mobile
     Desktop overrides via min-width media queries
     ═══════════════════════════════════════════════ */

  /* ── Nav ── */
  .site-nav { background: linear-gradient(var(--bg-primary), var(--bg-secondary)); padding: 0 0.75rem; display: flex; align-items: center; position: sticky; top: 0; z-index: 100; border-bottom: 1px solid var(--border); min-height: 3rem; box-shadow: 0 1px 3px rgba(0,0,0,0.04); flex-wrap: wrap; }
  .brand { font-weight: 700; font-size: 1rem; text-decoration: none; color: var(--text-heading); letter-spacing: -0.02em; display: flex; align-items: center; gap: 0.3rem; padding: 0.5rem 0; }
  .brand-accent { color: var(--accent); }
  .nav-right { display: flex; align-items: center; gap: 0.25rem; margin-left: auto; }
  .hamburger { background: transparent; border: none; color: var(--nav-link); cursor: pointer; font-size: 1.2rem; padding: 0.35rem 0.5rem; border-radius: 4px; }
  .hamburger:hover { color: var(--nav-link-hover); }
  .nav-links { display: none; width: 100%; flex-direction: column; padding: 0.5rem 0; border-top: 1px solid var(--border-subtle); }
  .nav-links.open { display: flex; }
  .nav-link { color: var(--nav-link); text-decoration: none; font-size: 0.85rem; padding: 0.5rem 0.5rem; transition: opacity 0.15s; white-space: nowrap; }
  .nav-link:hover { color: var(--nav-link-hover); background: var(--bg-hover); border-radius: 4px; }
  .nav-active { color: var(--text-heading); font-weight: 600; }
  .nav-ext { color: var(--text-dim); font-size: 0.82rem; padding: 0.5rem 0.5rem; text-decoration: none; }
  .nav-ext:hover { color: var(--nav-link-hover); }
  .theme-toggle { background: transparent; border: none; color: var(--nav-link); cursor: pointer; padding: 0.35rem; font-size: 0.9rem; border-radius: 4px; }
  .theme-toggle:hover { color: var(--nav-link-hover); }

  /* ── Content ── */
  .content { max-width: 780px; margin: 0 auto; padding: 1.25rem 1rem 2.5rem; }
  h1 { color: var(--text-heading); font-size: 1.3rem; font-weight: 700; margin-bottom: 0.6rem; letter-spacing: -0.02em; line-height: 1.3; }
  h2 { color: var(--text-heading); font-size: 1.05rem; font-weight: 600; margin: 2rem 0 0.6rem; padding-bottom: 0.35rem; border-bottom: 1px solid var(--border-subtle); }
  h3 { color: var(--accent); font-size: 0.92rem; font-weight: 600; margin: 1.5rem 0 0.4rem; }
  h4 { color: var(--text-heading); font-size: 0.85rem; font-weight: 600; margin: 1rem 0 0.35rem; }
  p { margin: 0.65rem 0; color: var(--text-body); font-size: 0.92rem; }
  a { color: var(--accent); text-decoration-color: var(--accent-underline); text-underline-offset: 2px; }
  a:hover { text-decoration-color: var(--accent); }
  strong { color: var(--text-heading); font-weight: 600; }
  em { color: var(--text-muted); }

  /* ── Code ── */
  code { font-family: var(--font-code); background: var(--bg-code); padding: 0.12rem 0.35rem; border-radius: 3px; font-size: 0.82em; word-break: break-word; }
  pre { background: var(--bg-code); padding: 0.75rem 1rem; overflow-x: auto; margin: 1rem 0; border-radius: 6px; border: 1px solid var(--border-subtle); -webkit-overflow-scrolling: touch; }
  pre code { background: none; padding: 0; border-radius: 0; font-size: 0.78rem; line-height: 1.5; word-break: normal; }

  /* ── Tables ── */
  table { border-collapse: collapse; width: 100%; margin: 1rem 0; font-size: 0.8rem; display: block; overflow-x: auto; -webkit-overflow-scrolling: touch; }
  th, td { border: 1px solid var(--border-subtle); padding: 0.4rem 0.6rem; text-align: left; white-space: nowrap; }
  th { background: var(--bg-secondary); color: var(--text-heading); font-weight: 600; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.03em; }

  /* ── Lists, blockquotes, hr ── */
  ul, ol { margin: 0.65rem 0; padding-left: 1.25rem; font-size: 0.92rem; }
  li { margin-bottom: 0.3rem; }
  blockquote { border-left: 3px solid var(--accent); padding: 0.4rem 0.75rem; margin: 0.75rem 0; background: var(--bg-hover); border-radius: 0 4px 4px 0; color: var(--text-muted); font-size: 0.9rem; }
  hr { border: none; border-top: 1px solid var(--border-subtle); margin: 2rem 0; }

  /* ── Footer ── */
  .footer { margin-top: 3rem; padding: 1.25rem 0; border-top: 1px solid var(--border-subtle); font-size: 0.75rem; color: var(--text-dim); display: flex; flex-direction: column; gap: 0.3rem; }
  .footer a { color: var(--text-muted); }

  /* ═══════════════════════════════════════════════
     TABLET (600px+)
     ═══════════════════════════════════════════════ */
  @media (min-width: 600px) {
    .hamburger { display: none; }
    .nav-links { display: flex !important; width: auto; flex-direction: row; align-items: center; gap: 0; border-top: none; padding: 0; }
    .nav-right { gap: 0.4rem; }
    .site-nav { padding: 0 1.5rem; flex-wrap: nowrap; }
    .nav-link { font-size: 0.78rem; padding: 0.4rem 0.5rem; }
    .nav-link:hover { background: none; }
    .nav-ext { display: inline; }
    .concepts { grid-template-columns: repeat(3, 1fr); }
    .engine-grid { grid-template-columns: repeat(2, 1fr); }
    .hero h1 { font-size: 2.5rem; }
    .content { padding: 2rem 1.5rem 3.5rem; }
    h1 { font-size: 1.45rem; }
    h2 { font-size: 1.12rem; }
    p, ul, ol { font-size: 0.95rem; }
    pre code { font-size: 0.82rem; }
    table { font-size: 0.85rem; }
    th, td { white-space: normal; }
    .footer { flex-direction: row; justify-content: space-between; }
  }

  /* ═══════════════════════════════════════════════
     DESKTOP (900px+)
     ═══════════════════════════════════════════════ */
  @media (min-width: 900px) {
    .site-nav { padding: 0 2rem; gap: 0.5rem; height: 3.25rem; }
    .brand { font-size: 1.05rem; }
    .nav-link { font-size: 0.82rem; padding: 0.4rem 0.6rem; }
    .content { padding: 2.5rem 2rem 4rem; }
    h1 { font-size: 1.6rem; }
    h2 { font-size: 1.2rem; margin: 2.5rem 0 0.75rem; }
    h3 { font-size: 1rem; }
    p { font-size: 1rem; }
    pre { padding: 1rem 1.25rem; }
    pre code { font-size: 0.85rem; }
    table { font-size: 0.88rem; display: table; }
    th, td { padding: 0.55rem 0.85rem; }
    .footer { font-size: 0.8rem; }
  }
</style>
</head>
<body>
<nav class="site-nav">
  <a href="/" class="brand">htx<span class="brand-accent">lang</span></a>
  <div class="nav-right">
    <button class="theme-toggle" id="themeToggle" title="Toggle theme">◐</button>
    <button class="hamburger" id="hamburger" aria-label="Menu">☰</button>
  </div>
  <div class="nav-links" id="navLinks">
    ${navHtml}
    <a href="https://github.com/jaredef/htxlang" class="nav-ext">GitHub ↗</a>
  </div>
</nav>
<div class="content">
  ${body}
  <div class="footer">
    <span>htxlang.org — <a href="https://jaredfoy.com">Jared Foy</a>, Southern Oregon</span>
    <span><a href="https://github.com/jaredef/htxlang">github.com/jaredef/htxlang</a> · MIT</span>
  </div>
</div>
<script>
  document.getElementById('hamburger').addEventListener('click', function(){
    document.getElementById('navLinks').classList.toggle('open');
    this.textContent = this.textContent === '☰' ? '✕' : '☰';
  });
  document.getElementById('themeToggle').addEventListener('click', function(){
    var current = document.documentElement.getAttribute('data-theme');
    var next = current === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
  });
  hljs.highlightAll();
</script>
</body>
</html>`;
}

const PRESTO_DIR = "/home/jaredef/presto";

const mdRoutes: Record<string, string> = {
  "/spec": "spec/htxlang-v1.md",
  "/spec/plan": "spec/plan.md",
  "/spec/implementation": "spec/implementation.md",
  "/spec/reference-profile": "spec/reference-profile.md",
  "/seed": "seed/presto-seed.md",
  "/docs/architecture": "docs/architecture.md",
  "/docs/thinking": "docs/thinking-in-presto.md",
};

interface EngineInfo {
  slug: string; lang: string; icon: string; lines: number; status: string; statusColor: string;
  description: string; file: string; snippet: string;
}

const engines: EngineInfo[] = [
  { slug: "ts", lang: "TypeScript", icon: "TS", lines: 1555, status: "Reference", statusColor: "#5b96d5",
    description: "Bun runtime. Powers jaredfoy.com. Most complete derivation.",
    file: "src/runtime/request-handler.ts", snippet: `// The bilateral boundary: htx: directives are server territory\n// Resolution strips them, producing pure HTML\nconst resolved = this.resolve(template, context);\nreturn new Response(resolved, { headers: { "Content-Type": "text/html" } });` },
  { slug: "go", lang: "Go", icon: "GO", lines: 2387, status: "Functional", statusColor: "#4ade80",
    description: "Native HTTP server. Full pipeline with middleware.",
    file: "main.go", snippet: `// Bilateral boundary: resolve htx: directives, emit pure HTML\nfunc (e *Engine) Resolve(template string, ctx Context) string {\n    resolved := e.processDirectives(template, ctx)\n    return e.stripNamespace(resolved)\n}` },
  { slug: "zig", lang: "Zig", icon: "⚡", lines: 2516, status: "Functional", statusColor: "#4ade80",
    description: "Comptime-optimized. HTTP server, CLI, conformance tests.",
    file: "src/engine.zig", snippet: `// Bilateral boundary in Zig: comptime template resolution\npub fn resolve(self: *Engine, template: []const u8, ctx: *Context) ![]u8 {\n    const parsed = try self.parse(template);\n    return try self.emit(parsed, ctx); // pure HTML out\n}` },
  { slug: "elixir", lang: "Elixir", icon: "Ex", lines: 26764, status: "Functional", statusColor: "#4ade80",
    description: "Phoenix-based. Comprehensive module system.",
    file: "lib/presto_engine.ex", snippet: `# Bilateral boundary: htx: namespace is server territory\n# Resolution produces pure HTML for the client\ndef resolve(template, context) do\n  template\n  |> parse_directives()\n  |> evaluate(context)\n  |> strip_server_namespace()\nend` },
  { slug: "rust", lang: "Rust", icon: "Rs", lines: 54155, status: "In Progress", statusColor: "#f59e0b",
    description: "Most ambitious derivation. Ownership-driven safety.",
    file: "src/engine.rs", snippet: `// Bilateral boundary: server-side htx: directives resolved\n// Client receives pure HTML — no framework required\nimpl Engine {\n    pub fn resolve(&self, template: &str, ctx: &Context) -> Result<String> {\n        let parsed = self.parse(template)?;\n        Ok(self.emit(&parsed, ctx))\n    }\n}` },
  { slug: "c", lang: "C", icon: "C", lines: 4209, status: "Proof of Concept", statusColor: "#f59e0b",
    description: "Minimal. Compiles on Raspberry Pi 5. Zero dependencies.",
    file: "engine.c", snippet: `/* Bilateral boundary: htx: directives are server territory */\n/* Resolution strips them — output is pure HTML */\nchar* resolve(Engine* e, const char* tmpl, Context* ctx) {\n    char* parsed = parse_directives(e, tmpl);\n    return emit_html(e, parsed, ctx);\n}` },
  { slug: "python", lang: "Python", icon: "Py", lines: 1631, status: "Functional", statusColor: "#4ade80",
    description: "Simplest derivation. Readable reference.",
    file: "engine.py", snippet: `# Bilateral boundary: htx: namespace = server territory\n# Resolution produces pure HTML for the client\ndef resolve(self, template: str, context: dict) -> str:\n    parsed = self.parse_directives(template)\n    return self.emit(parsed, context)  # pure HTML out` },
];

function buildLandingPage(): string {
  const engineCards = engines.map(e => `
    <a href="/engines/${e.slug}" class="engine-card">
      <div class="engine-icon">${e.icon}</div>
      <div class="engine-info">
        <div class="engine-lang">${e.lang}</div>
        <div class="engine-meta"><span class="engine-lines">${e.lines.toLocaleString()} lines</span> · <span style="color:${e.statusColor}">${e.status}</span></div>
        <div class="engine-desc">${e.description}</div>
      </div>
    </a>`).join("\n");

  return `
    <div class="hero">
      <h1>htx<span class="brand-accent">lang</span></h1>
      <p class="hero-sub">A template language and resolution model for hypermedia-native web applications.</p>
      <p class="hero-pitch">HTML in, pure HTML out. The bilateral boundary. Progressive layers. No client-side framework required.</p>
    </div>

    <div class="concepts">
      <div class="concept-card">
        <h3>Bilateral Boundary</h3>
        <p>The <code>htx:</code> namespace is server territory. HTML is client territory. Resolution strips the server affordances, producing pure HTML. The boundary is absolute.</p>
        <a href="/spec">Read the specification →</a>
      </div>
      <div class="concept-card">
        <h3>Progressive Layers</h3>
        <p>Code-on-demand is not binary. Layer 0 is pure HTML. Layer 6 is native-speed computation. Each layer is independently adoptable.</p>
        <a href="/docs/architecture">Understand the architecture →</a>
      </div>
      <div class="concept-card">
        <h3>The Resolver Model</h3>
        <p>Input: HTML. Output: HTML. Same medium. The engine adds capability without changing the medium. No framework tax.</p>
        <a href="/spec/implementation">Implementation guide →</a>
      </div>
    </div>

    <h2 id="engines">Seven Engine Derivations</h2>
    <p>All derived from the same <a href="/seed">~2,200-word prose seed</a>. Different languages. Same constraints. Same induced properties. This is the <a href="https://jaredfoy.com/doc/247-the-derivation-inversion">derivation inversion</a> — the seed determines the harvest.</p>
    <div class="engine-grid">${engineCards}</div>

    <div class="cta-section">
      <h2>Build Your Own Engine</h2>
      <p>Feed the <a href="/seed">PRESTO Seed</a> to any frontier language model. Specify your target language. The model derives a conformant implementation. Validated across seven languages.</p>
      <div class="cta-buttons">
        <a href="/seed" class="cta-primary">Get the Seed</a>
        <a href="https://github.com/jaredef/presto" class="cta-secondary">View All Engines</a>
        <a href="/spec" class="cta-secondary">Read the Spec</a>
      </div>
    </div>
  `;
}

function buildEnginePage(e: EngineInfo): string {
  return `
    <p class="breadcrumb"><a href="/">htxlang</a> → <a href="/#engines">Engines</a> → ${e.lang}</p>
    <h1>${e.lang} Engine</h1>
    <p class="engine-page-meta">
      <span style="color:${e.statusColor};font-weight:600;">${e.status}</span> · ${e.lines.toLocaleString()} lines · <a href="https://github.com/jaredef/presto/tree/main/engines/${e.slug}">View on GitHub →</a>
    </p>
    <p>${e.description}</p>

    <h2>The Bilateral Boundary in ${e.lang}</h2>
    <pre><code>${e.snippet.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>

    <h2>Derived from the Same Seed</h2>
    <p>This engine was derived from the <a href="/seed">PRESTO Seed</a> — the same ~2,200-word prose specification that produced all seven conformant implementations. The seed specifies the bilateral boundary, the resolver model, progressive layers, and two-phase mutations. The ${e.lang} implementation is one instance of the form.</p>

    <h2>Key File</h2>
    <p><code><a href="https://github.com/jaredef/presto/tree/main/engines/${e.slug}/${e.file}">${e.file}</a></code></p>

    <h2>Run It</h2>
    <p>See <a href="https://github.com/jaredef/presto/tree/main/engines/${e.slug}">engines/${e.slug}/</a> in the <a href="https://github.com/jaredef/presto">presto repository</a> for setup and run instructions.</p>

    <hr>
    <p><a href="/#engines">← All engines</a> · <a href="/spec">Specification</a> · <a href="/seed">The Seed</a></p>
  `;
}

Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",
  fetch(req) {
    const url = new URL(req.url);
    let path = url.pathname.replace(/\/+$/, "") || "/";

    // Landing page
    if (path === "/") {
      return new Response(wrapHtml("htxlang", buildLandingPage(), path), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // Engine pages
    const engineMatch = path.match(/^\/engines\/(\w+)$/);
    if (engineMatch) {
      const e = engines.find(eng => eng.slug === engineMatch[1]);
      if (e) {
        return new Response(wrapHtml(`${e.lang} Engine`, buildEnginePage(e), path), {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }
    }

    // Markdown routes
    const file = mdRoutes[path];
    if (file) {
      const fullPath = resolve(ROOT, file);
      if (existsSync(fullPath)) {
        const md = readFileSync(fullPath, "utf-8");
        const html = renderMarkdown(md);
        const title = md.match(/^#\s+(.+)$/m)?.[1] || "htxlang";
        return new Response(wrapHtml(title, html, path), {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }
    }

    return new Response("Not found", { status: 404 });
  },
});

console.log(`htxlang.org listening on http://0.0.0.0:${PORT}`);
