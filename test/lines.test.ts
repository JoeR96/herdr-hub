import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLines, toTokens, BLANK } from "../src/model/lines.ts";
import type { SpaceView } from "../src/model/lines.ts";

const now = Date.parse("2026-10-10T12:00:00Z");
const clean = { branch: "main", upstream: "origin/main", ahead: 2, behind: 0, dirty: false };
const base: SpaceView = { kind: "main", git: clean, agents: [], pr: null, release: null, ghProblem: null, stale: false, now, indent: "blank", evidence: null };

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

test("worktree branch line shows evidence state", () => {
  const wt = { ...base, kind: "worktree" as const, git: { ...clean, branch: "feature/x", ahead: 0 } };
  const branch = (evidence: SpaceView["evidence"]) => buildLines({ ...wt, evidence })[0].replaceAll(BLANK, "");
  assert.equal(branch(null), "feature/x ✓");
  assert.equal(branch({ url: "https://claude.ai/artifact/a", unpublished: 0 }), "feature/x ✓ · evidence");
  assert.equal(branch({ url: "https://claude.ai/artifact/a", unpublished: 3 }), "feature/x ✓ · evidence +3");
  assert.equal(branch({ url: null, unpublished: 2 }), "feature/x ✓ · evidence +2");
  assert.equal(buildLines({ ...base, evidence: { url: "u", unpublished: 1 } })[0].replaceAll(BLANK, ""), "main ✓ ⇡2");
});
