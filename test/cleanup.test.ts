import { test } from "node:test";
import assert from "node:assert/strict";
import { findCandidates, mapUsage, warnings } from "../src/model/cleanup.ts";
import type { CleanupInput } from "../src/model/cleanup.ts";
import { normPath } from "../src/model/paths.ts";

const DAY = 86_400_000;
const now = Date.parse("2026-10-10T12:00:00Z");
const k = (p: string) => normPath(p);
const wt = (path: string, branch: string | null, head = "h-" + path, prunable = false) => ({ path, head, branch, prunable, isMain: false });

function input(over: Partial<CleanupInput> = {}): CleanupInput {
  return {
    worktrees: [{ path: "/repo", head: "base", branch: "main", prunable: false, isMain: true }],
    baseTip: "base", merged: new Set(), mergedPrs: new Map(), openPrBranches: new Set(),
    headMs: new Map(), createdMs: new Map(), dirty: new Map(), detachedSafe: new Set(), usage: new Map(),
    staleDays: 30, now, ...over,
  };
}

test("never offers the main checkout", () => {
  assert.deepEqual(findCandidates(input({ merged: new Set(["main"]) })), []);
});

test("offers merged, PR-merged, stale and missing worktrees in that order", () => {
  const i = input({
    worktrees: [wt("/wt/stale", "feature/old"), wt("/wt/pr", "feature/pr"), wt("/wt/merged", "feature/done"), wt("/wt/gone", "x", "h", true)],
    merged: new Set(["feature/done"]), mergedPrs: new Map([["feature/pr", 12]]),
    headMs: new Map([[k("/wt/stale"), now - 45 * DAY], [k("/wt/pr"), now], [k("/wt/merged"), now]]),
    createdMs: new Map([[k("/wt/stale"), now - 50 * DAY], [k("/wt/pr"), now - DAY], [k("/wt/merged"), now - DAY]]),
  });
  assert.deepEqual(findCandidates(i).map((c) => [c.path, c.reason, c.detail]), [
    ["/wt/gone", "missing", "folder missing"],
    ["/wt/merged", "merged", "merged"],
    ["/wt/pr", "pr-merged", "PR #12 merged"],
    ["/wt/stale", "stale", "stale 45 days"],
  ]);
});

test("a fresh worktree at the base tip is not treated as merged", () => {
  const i = input({ worktrees: [wt("/wt/new", "feature/new", "base")], merged: new Set(["feature/new"]), headMs: new Map([[k("/wt/new"), now]]) });
  assert.deepEqual(findCandidates(i), []);
});

test("a worktree that never committed is not merged after the base moves on", () => {
  // created at old tip X; origin/main moved to "base" since; the branch has no commits of its own
  const i = input({
    worktrees: [wt("/wt/new", "feature/new", "X")], merged: new Set(["feature/new"]),
    headMs: new Map([[k("/wt/new"), now - 2 * DAY]]), createdMs: new Map([[k("/wt/new"), now - DAY]]),
  });
  assert.deepEqual(findCandidates(i), []);
});

test("an open PR keeps an old worktree out of the stale list", () => {
  const i = input({ worktrees: [wt("/wt/old", "feature/old")], openPrBranches: new Set(["feature/old"]), headMs: new Map([[k("/wt/old"), now - 90 * DAY]]) });
  assert.deepEqual(findCandidates(i), []);
});

test("stale age uses the later of the last commit and the worktree's creation", () => {
  const i = input({ worktrees: [wt("/wt/old", "feature/old")], headMs: new Map([[k("/wt/old"), now - 90 * DAY]]), createdMs: new Map([[k("/wt/old"), now - 2 * DAY]]) });
  assert.deepEqual(findCandidates(i), []);
});

test("a detached worktree whose commits are on no branch cannot be ticked", () => {
  const [c] = findCandidates(input({ worktrees: [wt("/wt/exp", null)], headMs: new Map([[k("/wt/exp"), now - 45 * DAY]]) }));
  assert.equal(c.reason, "stale");
  assert.equal(c.selectable, false);
  assert.ok(warnings(c).includes("detached: commits not on any branch"));
});

test("a detached worktree whose head is on a branch can be ticked", () => {
  const [c] = findCandidates(input({ worktrees: [wt("/wt/exp", null)], headMs: new Map([[k("/wt/exp"), now - 45 * DAY]]), detachedSafe: new Set([k("/wt/exp")]) }));
  assert.equal(c.selectable, true);
});

test("dirty worktrees are listed but cannot be selected; running agents are warned about", () => {
  const key = k("/wt/merged");
  const [c] = findCandidates(input({
    worktrees: [wt("/wt/merged", "feature/done")], merged: new Set(["feature/done"]),
    dirty: new Map([[key, true]]), usage: new Map([[key, { ownSpace: "w9", otherSpaces: [], agentCount: 1 }]]),
  }));
  assert.equal(c.selectable, false);
  assert.equal(c.workspaceId, "w9");
  assert.deepEqual(warnings(c), ["dirty: has uncommitted changes", "agent running: will be stopped"]);
});

test("a worktree that another space is using cannot be ticked", () => {
  const key = k("/wt/merged");
  const [c] = findCandidates(input({
    worktrees: [wt("/wt/merged", "feature/done")], merged: new Set(["feature/done"]),
    usage: new Map([[key, { ownSpace: null, otherSpaces: ["big daves bonanza"], agentCount: 1 }]]),
  }));
  assert.equal(c.selectable, false);
  assert.ok(warnings(c).includes("in use by big daves bonanza"));
});

test("mapUsage finds every pane inside a worktree, whichever space it belongs to", () => {
  const usage = mapUsage(
    ["D:/wt/a", "D:/wt/b"],
    [
      { workspaceId: "w1", label: "a space", paneId: "w1:p1", cwd: "D:\\wt\\a" },
      { workspaceId: "w1", label: "a space", paneId: "w1:p2", cwd: "C:\\Users\\me" },
      { workspaceId: "w2", label: "main space", paneId: "w2:p3", cwd: "D:\\wt\\a\\src" },
      { workspaceId: "w3", label: "other", paneId: "w3:p1", cwd: "D:\\wt\\ab" },
    ],
    new Map([[k("D:/wt/a"), "w1"]]),
    new Set(["w1:p2", "w2:p3"]),
  );
  assert.deepEqual(usage.get(k("D:/wt/a")), { ownSpace: "w1", otherSpaces: ["main space"], agentCount: 2 });
  assert.deepEqual(usage.get(k("D:/wt/b")), { ownSpace: null, otherSpaces: [], agentCount: 0 });
});
