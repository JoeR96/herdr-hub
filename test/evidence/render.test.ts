import { test } from "node:test";
import assert from "node:assert/strict";
import { renderPage } from "../../claude-evidence/lib/render.ts";
import type { Item, Store } from "../../claude-evidence/lib/store.ts";

const ctx = { repo: "herdr-hub", branch: "feature/x", worktree: "D:/wt/x", commit: "abc123 Add things", updatedAt: "2026-10-12T14:00:00Z" };
const item = (id: number, round: number, kind: Item["kind"], file: string | null, caption = `item ${id}`): Item =>
  ({ id, round, kind, file, caption, addedAt: "2026-10-12T13:00:00Z" });
const texts: Record<string, string> = { "files/3-t.txt": "ok 1\nok 2", "files/4-l.txt": "log line", "files/5-d.diff": "+added\n-removed\n same" };
const read = (f: string) => texts[f] ?? "";

const store: Store = { version: 1, round: 4, items: [
  item(1, 1, "screenshot", "files/1-a.png"),
  item(2, 1, "video", "files/2-v.mp4"),
  item(3, 3, "test-output", "files/3-t.txt"),
  item(4, 3, "log", "files/4-l.txt"),
  item(5, 3, "diff", "files/5-d.diff"),
  item(6, 3, "note", null, "All <script>alert(1)</script> & done"),
] };

test("rounds render newest first and empty rounds are skipped", () => {
  const html = renderPage(ctx, store, read);
  assert.ok(html.indexOf("Round 3") < html.indexOf("Round 1"));
  assert.equal(html.includes("Round 2"), false);
  assert.equal(html.includes("Round 4"), false);
});

test("each kind gets its own element", () => {
  const html = renderPage(ctx, store, read);
  assert.match(html, /<img[^>]+src="files\/1-a\.png"/);
  assert.match(html, /<video controls[^>]*src="files\/2-v\.mp4"/);
  assert.match(html, /<details open>[\s\S]*?ok 1\nok 2/);
  assert.match(html, /<details>[\s\S]*?log line/);
  assert.match(html, /<span class="add">\+added<\/span>/);
  assert.match(html, /<span class="del">-removed<\/span>/);
});

test("captions and text are escaped", () => {
  const html = renderPage(ctx, store, read);
  assert.equal(html.includes("<script>alert(1)"), false);
  assert.ok(html.includes("All &lt;script&gt;alert(1)&lt;/script&gt; &amp; done"));
});

test("page follows the artifact contract", () => {
  const html = renderPage(ctx, store, read);
  assert.ok(html.startsWith("<title>Evidence · feature/x</title>"));
  assert.ok(html.includes("@media (prefers-color-scheme: dark)"));
  assert.ok(html.includes(':root:not([data-theme="light"])'));
  assert.ok(html.includes(':root[data-theme="dark"]'));
  assert.equal(/<!doctype|<html|<body/i.test(html), false);
  assert.ok(html.includes("abc123 Add things"));
});
