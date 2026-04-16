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

const routes: Record<string, string> = {
  "/": "README.md",
  "/spec": "spec/htxlang-v1.md",
  "/spec/plan": "spec/plan.md",
  "/spec/implementation": "spec/implementation.md",
  "/spec/reference-profile": "spec/reference-profile.md",
  "/seed": "seed/presto-seed.md",
  "/docs/architecture": "docs/architecture.md",
  "/docs/thinking": "docs/thinking-in-presto.md",
};

Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",
  fetch(req) {
    const url = new URL(req.url);
    let path = url.pathname.replace(/\/+$/, "") || "/";

    const file = routes[path];
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
