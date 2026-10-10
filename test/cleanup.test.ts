import { test } from "node:test";
import assert from "node:assert/strict";
import { findCandidates, warnings } from "../src/model/cleanup.ts";
import type { CleanupInput } from "../src/model/cleanup.ts";
import { normPath } from "../src/model/paths.ts";

const DAY = 86_400_000;
const now = Date.parse("2026-10-10T12:00:00Z");
const wt = (path: string, branch: string | null, head = "h-" + path, prunable = false) => ({ path, head, branch, prunable, isMain: false });

function input(over: Partial<CleanupInput> = {}): CleanupInput {
  return {
    worktrees: [{ path: "/repo", head: "base", branch: "main", prunable: false, isMain: true }],
    baseTip: "base", merged: new Set(), mergedPrs: new Map(), openPrBranches: new Set(),
    activityMs: new Map(), dirty: new Map(), spaces: new Map(), staleDays: 30, now, ...over,
  };
}

test("never offers the main checkout", () => {
  assert.deepEqual(findCandidates(input({ merged: new Set(["main"]) })), []);
});

test("offers merged, PR-merged, stale and missing worktrees in that order", () => {
  const i = input({
    worktrees: [wt("/wt/stale", "feature/old"), wt("/wt/pr", "feature/pr"), wt("/wt/merged", "feature/done"), wt("/wt/gone", "x", "h", true)],
    merged: new Set(["feature/done"]), mergedPrs: new Map([["feature/pr", 12]]),
    activityMs: new Map([[normPath("/wt/stale"), now - 45 * DAY], [normPath("/wt/pr"), now], [normPath("/wt/merged"), now]]),
  });
  assert.deepEqual(findCandidates(i).map((c) => [c.path, c.reason, c.detail]), [
    ["/wt/gone", "missing", "folder missing"],
    ["/wt/merged", "merged", "merged"],
    ["/wt/pr", "pr-merged", "PR #12 merged"],
    ["/wt/stale", "stale", "stale 45 days"],
  ]);
});

test("a fresh worktree at the base tip is not treated as merged", () => {
  const i = input({ worktrees: [wt("/wt/new", "feature/new", "base")], merged: new Set(["feature/new"]), activityMs: new Map([[normPath("/wt/new"), now]]) });
  assert.deepEqual(findCandidates(i), []);
});

test("an open PR keeps an old worktree out of the stale list", () => {
  const i = input({ worktrees: [wt("/wt/old", "feature/old")], openPrBranches: new Set(["feature/old"]), activityMs: new Map([[normPath("/wt/old"), now - 90 * DAY]]) });
  assert.deepEqual(findCandidates(i), []);
});

test("dirty worktrees are listed but cannot be selected; running agents are warned about", () => {
  const key = normPath("/wt/merged");
  const [c] = findCandidates(input({
    worktrees: [wt("/wt/merged", "feature/done")], merged: new Set(["feature/done"]),
    dirty: new Map([[key, true]]), spaces: new Map([[key, { workspaceId: "w9", agentCount: 1 }]]),
  }));
  assert.equal(c.selectable, false);
  assert.equal(c.workspaceId, "w9");
  assert.deepEqual(warnings(c), ["dirty: has uncommitted changes", "agent running: will be stopped"]);
});
