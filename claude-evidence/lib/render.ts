import type { Item, Store } from "./store.ts";

export interface PageContext { repo: string; branch: string; worktree: string; commit: string; updatedAt: string }

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const when = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;

const KIND_LABEL: Record<Item["kind"], string> = {
  screenshot: "Screenshot", gif: "Recording", video: "Video", "test-output": "Test output", log: "Log", diff: "Diff", note: "Note",
};

function diffBody(text: string): string {
  return text.split("\n").map((l) => {
    const cls = l.startsWith("+") ? "add" : l.startsWith("-") ? "del" : l.startsWith("@@") ? "hunk" : "";
    return cls ? `<span class="${cls}">${esc(l)}</span>` : esc(l);
  }).join("\n");
}

function body(item: Item, readText: (file: string) => string): string {
  const src = item.file ? esc(item.file) : "";
  switch (item.kind) {
    case "screenshot":
    case "gif":
      return `<a class="shot" href="${src}" target="_blank" rel="noopener"><img src="${src}" alt="${esc(item.caption)}" loading="lazy"></a>`;
    case "video":
      return `<video controls preload="metadata" src="${src}"></video>`;
    case "note":
      return "";
    default: {
      if (!item.file) return "";
      const text = readText(item.file);
      const pre = item.kind === "diff" ? diffBody(text) : esc(text);
      const lines = text.split("\n").length;
      return `<details${item.kind === "test-output" ? " open" : ""}><summary>${lines} line${lines === 1 ? "" : "s"}</summary><pre>${pre}</pre></details>`;
    }
  }
}

function itemHtml(item: Item, readText: (file: string) => string): string {
  return `<article class="item ${item.kind}">
  <header><span class="kind">${KIND_LABEL[item.kind]}</span><h3>${esc(item.caption)}</h3><time>${when(item.addedAt).slice(11)}</time></header>
  ${body(item, readText)}
</article>`;
}

const STYLE = `
/* Layout: one reading column; a report header, then rounds newest first, each a stack of evidence items. */
:root {
  --bg: #f6f7f9; --surface: #ffffff; --fg: #1b2230; --muted: #5b6577; --line: #d9dee7;
  --accent: #1f6f5c; --accent-soft: #e2f1ec; --add: #1d6b35; --del: #a3282a; --code-bg: #f0f2f5;
  --font-body: "Atkinson Hyperlegible", "Segoe UI", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, Consolas, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #12161d; --surface: #1a2029; --fg: #e6e9ef; --muted: #9aa4b5; --line: #2c3442;
  --accent: #5cc3a5; --accent-soft: #173229; --add: #7fd69a; --del: #f08a8b; --code-bg: #10141a; color-scheme: dark } }
:root[data-theme="dark"] {
  --bg: #12161d; --surface: #1a2029; --fg: #e6e9ef; --muted: #9aa4b5; --line: #2c3442;
  --accent: #5cc3a5; --accent-soft: #173229; --add: #7fd69a; --del: #f08a8b; --code-bg: #10141a; color-scheme: dark }
* { box-sizing: border-box }
body { background: var(--bg); color: var(--fg); font: 17px/1.55 var(--font-body); padding: 0 16px; }
main { max-width: 980px; margin: 0 auto; padding-block: 32px 64px; display: grid; gap: 40px; }
.report { display: grid; gap: 12px; }
.eyebrow { font: 600 13px/1 var(--font-mono); letter-spacing: .08em; text-transform: uppercase; color: var(--accent); }
h1 { margin: 0; font-size: clamp(26px, 5vw, 36px); line-height: 1.15; text-wrap: balance; overflow-wrap: anywhere; }
dl { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 4px 16px; margin: 0; font-size: 15px; }
dt { color: var(--muted); } dd { margin: 0; font-family: var(--font-mono); font-size: 14px; overflow-wrap: anywhere; }
.round { display: grid; gap: 16px; }
.round > h2 { margin: 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; font-size: 22px;
  padding-bottom: 8px; border-bottom: 2px solid var(--line); }
.round > h2 small { font: 400 14px var(--font-mono); color: var(--muted); }
.round.latest > h2 { border-color: var(--accent); }
.item { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 16px; display: grid; gap: 12px; min-width: 0; }
.item header { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; }
.item h3 { margin: 0; font-size: 18px; flex: 1 1 240px; min-width: 0; overflow-wrap: anywhere; }
.kind { font: 600 12px/1 var(--font-mono); letter-spacing: .06em; text-transform: uppercase; color: var(--accent);
  background: var(--accent-soft); padding: 5px 8px; border-radius: 4px; }
time { font: 13px var(--font-mono); color: var(--muted); font-variant-numeric: tabular-nums; }
.shot { display: block; } .shot img, video { display: block; max-width: 100%; height: auto; border: 1px solid var(--line); border-radius: 4px; }
.shot:focus-visible, summary:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
details summary { cursor: pointer; color: var(--muted); font-size: 14px; }
pre { margin: 8px 0 0; padding: 12px; background: var(--code-bg); border-radius: 4px; overflow-x: auto; max-height: 480px;
  font: 13.5px/1.5 var(--font-mono); white-space: pre; }
.add { color: var(--add); } .del { color: var(--del); } .hunk { color: var(--muted); }
`;

export function renderPage(ctx: PageContext, store: Store, readText: (file: string) => string): string {
  const rounds = [...new Set(store.items.map((i) => i.round))].sort((a, b) => b - a);
  const sections = rounds.map((r, idx) => {
    const items = store.items.filter((i) => i.round === r);
    const last = items.reduce((m, i) => (i.addedAt > m ? i.addedAt : m), items[0].addedAt);
    return `<section class="round${idx === 0 ? " latest" : ""}">
<h2>Round ${r}<small>${when(last)} · ${items.length} item${items.length === 1 ? "" : "s"}</small></h2>
${items.map((i) => itemHtml(i, readText)).join("\n")}
</section>`;
  }).join("\n");

  return `<title>Evidence · ${esc(ctx.branch)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=JetBrains+Mono:wght@400;600&display=swap">
<style>${STYLE}</style>
<main>
<header class="report">
  <span class="eyebrow">Evidence</span>
  <h1>${esc(ctx.repo)} · ${esc(ctx.branch)}</h1>
  <dl>
    <dt>Worktree</dt><dd>${esc(ctx.worktree)}</dd>
    <dt>Last commit</dt><dd>${esc(ctx.commit || "none")}</dd>
    <dt>Updated</dt><dd>${when(ctx.updatedAt)}</dd>
  </dl>
</header>
${sections || "<p>No evidence saved yet.</p>"}
</main>
`;
}
