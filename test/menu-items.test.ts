import { test } from "node:test";
import assert from "node:assert/strict";
import { menuItems } from "../src/ui/menu-items.ts";

const base = { kind: "worktree" as const, prNumber: null, prUrl: null, releaseUrl: null, repoUrl: null, pinned: false, evidenceUrl: null };

test("worktree space with a PR offers to open it and cannot be pinned", () => {
  const ids = menuItems({ ...base, prNumber: 7, prUrl: "u", repoUrl: "r" }).map((i) => i.id);
  assert.deepEqual(ids, ["new-worktree", "open-pr", "open-repo", "cleanup", "refresh", "open-config", "doctor"]);
});

test("main space offers release and pin; other space offers a Claude tab", () => {
  const main = menuItems({ ...base, kind: "main", releaseUrl: "x", repoUrl: "r", pinned: true });
  assert.ok(main.some((i) => i.id === "open-release"));
  assert.equal(main.find((i) => i.id === "pin")?.label, "Unpin this space");
  const other = menuItems({ ...base, kind: "other" });
  assert.equal(other[0].label, "New Claude tab");
  assert.equal(other.find((i) => i.id === "pin")?.label, "Pin this space");
});

test("worktree with an evidence page offers to open it after the PR", () => {
  const items = menuItems({ ...base, prNumber: 7, prUrl: "u", repoUrl: "r", evidenceUrl: "https://claude.ai/artifact/a" });
  assert.deepEqual(items.map((i) => i.id).slice(0, 4), ["new-worktree", "open-pr", "open-evidence", "open-repo"]);
  assert.equal(items.find((i) => i.id === "open-evidence")?.label, "Open evidence page");
  assert.equal(menuItems({ ...base, repoUrl: "r" }).some((i) => i.id === "open-evidence"), false);
});
