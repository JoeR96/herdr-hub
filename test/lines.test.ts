import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLines, toTokens, BLANK, sidebarWidth, DEFAULT_WIDTH } from "../src/model/lines.ts";
import { cellWidth } from "../src/model/format.ts";
import type { SpaceView } from "../src/model/lines.ts";

const now = Date.parse("2026-10-10T12:00:00Z");
const clean = { branch: "main", upstream: "origin/main", ahead: 2, behind: 0, dirty: false };
const base: SpaceView = { kind: "main", git: clean, agents: [], pr: null, release: null, ghProblem: null, stale: false, now, indent: "blank", evidence: null, width: 200 };

test("main space: indented branch line and release line", () => {
  const lines = buildLines({ ...base, release: { source: "workflow", name: "Release Widgets", state: "success", atMs: now - 2 * 86_400_000, url: null } });
  assert.deepEqual(lines, [BLANK.repeat(4) + "main ✓ ⇡2", BLANK.repeat(4) + "⇡ Release Widgets · ✓ · 2d ago"]);
});

test("main space: dirty, behind, stale release and a gh problem", () => {
  const lines = buildLines({ ...base, git: { ...clean, ahead: 0, behind: 3, dirty: true }, stale: true, ghProblem: "gh not signed in",
    release: { source: "deployment", name: "Production", state: "pending", atMs: now - 60_000, url: null } });
  assert.deepEqual(lines.map((l) => l.replaceAll(BLANK, "")), ["main ● ⇣3", "⇡ Production · ⋯ · 1m ago · stale", "gh not signed in"]);
});

test("worktree space: agent, branch and PR lines with the deeper indent", () => {
  const lines = buildLines({ ...base, kind: "worktree", git: { ...clean, branch: "feature/stairs", ahead: 0 },
    agents: [{ kind: "claude", title: "stairs fix", state: "working" }, { kind: "claude", title: "other", state: "idle" }],
    pr: { number: 7, title: "t", url: "u", isDraft: true, headRefName: "feature/stairs", checks: "none" } });
  assert.deepEqual(lines, [
    BLANK.repeat(6) + "claude · stairs fix · working +1",
    BLANK.repeat(6) + "feature/stairs ✓",
    BLANK.repeat(6) + "PR #7 · draft · checks none",
  ]);
});

test("worktree space without agent or PR shows just the branch; detached shows detached", () => {
  const lines = buildLines({ ...base, kind: "worktree", git: { ...clean, branch: null, ahead: 0 } });
  assert.deepEqual(lines, [BLANK.repeat(6) + "detached ✓"]);
});

test("bar indent style uses a visible bar instead of blanks", () => {
  assert.deepEqual(buildLines({ ...base, git: { ...clean, ahead: 0 } }), [BLANK.repeat(4) + "main ✓"]);
  assert.deepEqual(buildLines({ ...base, git: { ...clean, ahead: 0 }, indent: "bar" }), ["│ main ✓"]);
});

test("no git status and nothing else gives no lines", () => {
  assert.deepEqual(buildLines({ ...base, git: null }), []);
});

test("toTokens fills hub1..hub4 and clears the rest", () => {
  assert.deepEqual(toTokens(["a", "b"]), { hub1: "a", hub2: "b", hub3: null, hub4: null });
});

test("evidence gets its own line after the PR", () => {
  const wt = { ...base, kind: "worktree" as const, git: { ...clean, branch: "feature/x", ahead: 0 },
    pr: { number: 7, title: "t", url: "u", isDraft: false, headRefName: "feature/x", checks: "success" as const } };
  const text = (evidence: SpaceView["evidence"]) => buildLines({ ...wt, evidence }).map((l) => l.replaceAll(BLANK, ""));
  assert.deepEqual(text(null), ["feature/x ✓", "PR #7 · open · checks ✓"]);
  assert.deepEqual(text({ url: "https://claude.ai/artifact/a", unpublished: 0 }), ["feature/x ✓", "PR #7 · open · checks ✓", "evidence ✓"]);
  assert.deepEqual(text({ url: "https://claude.ai/artifact/a", unpublished: 3 }).at(-1), "evidence +3 to publish");
  assert.deepEqual(text({ url: null, unpublished: 2 }).at(-1), "evidence +2 to publish");
  assert.equal(buildLines({ ...base, evidence: { url: "u", unpublished: 1 } }).length, 1);
});

// Measured on herdr 0.9.1 with sidebar_width = 52: a top-level space row shows 44 cells and a
// worktree row nested under its repo shows 40. Rows keep one more cell spare.
test("rows fit herdr's measured room: sidebar width less 9 for spaces, 13 for nested worktrees", () => {
  const long = "x".repeat(80);
  assert.equal(cellWidth(buildLines({ ...base, width: 52, ghProblem: long })[1]), 43);
  assert.equal(cellWidth(buildLines({ ...base, kind: "worktree", width: 52, pr: null, git: { ...clean, branch: long } })[0]), 39);
});

test("wide characters count as two cells and status marks still survive", () => {
  const lines = buildLines({ ...base, kind: "worktree", width: 52,
    git: { ...clean, branch: "feature/日本語のブランチ名前テスト機能追加", ahead: 3, behind: 1, dirty: true },
    agents: [{ kind: "claude", title: "🚀 修复登录页面的错误并添加测试", state: "working" }] });
  for (const l of lines) assert.ok(cellWidth(l) <= 39, `${l} is ${cellWidth(l)} cells`);
  assert.ok(lines[0].endsWith("… · working"));
  assert.ok(lines[1].endsWith("… ● ⇡3 ⇣1"));
});

test("long names are shortened to fit the width and the status marks survive", () => {
  const cells = cellWidth;
  const lines = buildLines({ ...base, kind: "worktree", width: 43,
    git: { ...clean, branch: "feature/arena-experience-overhaul", ahead: 37, dirty: true },
    agents: [{ kind: "claude", title: "bdb-arena-experience-overhaul", state: "working" }],
    evidence: { url: "u", unpublished: 12 } });
  for (const l of lines) assert.ok(cells(l) <= 30, `${l} is ${cells(l)} wide`);
  const text = lines.map((l) => l.replaceAll(BLANK, ""));
  assert.match(text[0], /^claude · bdb.*… · working$/);
  assert.match(text[1], /^feature\/arena.*… ● ⇡37$/);
  assert.equal(text[2], "evidence +12 to publish");
});

test("lines with nothing to shorten are cut at the end with an ellipsis", () => {
  const lines = buildLines({ ...base, width: 21, ghProblem: "gh not signed in", git: { ...clean, ahead: 0 } });
  assert.deepEqual(lines.map(cellWidth), [10, 12]);
  assert.ok(lines[1].endsWith("…"));
});

test("sidebarWidth prefers a dragged width from session.json, then config.toml", () => {
  const toml = "[ui]\nsidebar_width = 52\nsidebar_max_width = 72\n";
  assert.equal(sidebarWidth(toml, null), 52);
  assert.equal(sidebarWidth(toml, '{"sidebar_width": null}'), 52);
  assert.equal(sidebarWidth(toml, '{"sidebar_width": 64}'), 64);
  assert.equal(sidebarWidth(toml, "not json"), 52);
  assert.equal(sidebarWidth("[ui]\npane_gaps = true\n", null), DEFAULT_WIDTH);
  assert.equal(sidebarWidth(null, null), DEFAULT_WIDTH);
});
