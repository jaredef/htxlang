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

function wrapHtml(title: string, body: string): string {
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
<style>
  :root { --bg: #0a0a0f; --fg: #c8c8d4; --fg-bright: #e8e8f0; --accent: #ff8800; --teal: #4a9; --border: #1a1a28; --code-bg: #111118; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'DejaVu Sans Mono', 'Menlo', 'Consolas', monospace; background: var(--bg); color: var(--fg); line-height: 1.7; }
  .container { max-width: 800px; margin: 0 auto; padding: 2rem 1.5rem; }
  nav { padding: 1rem 0; border-bottom: 1px solid var(--border); margin-bottom: 2rem; }
  nav a { color: var(--accent); text-decoration: none; margin-right: 1.5rem; font-size: 0.85rem; }
  nav a:hover { text-decoration: underline; }
  h1 { color: var(--accent); font-size: 1.5rem; margin-bottom: 0.5rem; }
  h2 { color: var(--fg-bright); font-size: 1.2rem; margin: 2rem 0 0.75rem; border-bottom: 1px solid var(--border); padding-bottom: 0.3rem; }
  h3 { color: var(--teal); font-size: 1rem; margin: 1.5rem 0 0.5rem; }
  h4 { color: var(--fg-bright); font-size: 0.9rem; margin: 1rem 0 0.5rem; }
  p { margin: 0.75rem 0; }
  a { color: var(--accent); }
  code { background: var(--code-bg); padding: 0.15rem 0.4rem; font-size: 0.9em; color: var(--teal); }
  pre { background: var(--code-bg); padding: 1rem; overflow-x: auto; margin: 1rem 0; border-left: 2px solid var(--border); }
  pre code { background: none; padding: 0; color: var(--fg); }
  table { border-collapse: collapse; width: 100%; margin: 1rem 0; font-size: 0.85rem; }
  th, td { border: 1px solid var(--border); padding: 0.5rem 0.75rem; text-align: left; }
  th { background: var(--code-bg); color: var(--fg-bright); }
  blockquote { border-left: 2px solid var(--accent); padding-left: 1rem; margin: 1rem 0; color: #aaa; }
  ul, ol { margin: 0.75rem 0; padding-left: 1.5rem; }
  li { margin-bottom: 0.3rem; }
  strong { color: var(--fg-bright); }
  hr { border: none; border-top: 1px solid var(--border); margin: 2rem 0; }
  .footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid var(--border); font-size: 0.8rem; color: #666; }
</style>
</head>
<body>
<div class="container">
  <nav>
    <a href="/">htxlang</a>
    <a href="/spec">Specification</a>
    <a href="/spec/implementation">Implementation</a>
    <a href="/spec/reference-profile">Reference Profile</a>
    <a href="/seed">Seed</a>
    <a href="https://github.com/jaredef/htxlang">GitHub</a>
  </nav>
  ${body}
  <div class="footer">
    <p>htxlang.org — <a href="https://jaredfoy.com">Jared Foy</a>, Southern Oregon</p>
    <p><a href="https://github.com/jaredef/htxlang">github.com/jaredef/htxlang</a> · MIT License</p>
  </div>
</div>
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
        return new Response(wrapHtml(title, html), {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }
    }

    return new Response("Not found", { status: 404 });
  },
});

console.log(`htxlang.org listening on http://0.0.0.0:${PORT}`);
