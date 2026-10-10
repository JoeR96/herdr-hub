import { test } from "node:test";
import assert from "node:assert/strict";
import { classify } from "../src/model/classify.ts";

test("uses herdr's linked-worktree info when present, cleaning the long-path prefix", () => {
  const k = classify({ label: "x", worktree: { repo_root: "\\\\?\\C:\\Repo", checkout_path: "D:/wt/x", is_linked_worktree: true } }, []);
  assert.equal(k.kind, "worktree");
  if (k.kind === "other") return;
  assert.equal(k.repoRoot, "C:\\Repo");
  assert.equal(k.folder, "D:/wt/x");
  assert.equal(k.repoKey, process.platform === "win32" ? "c:/repo" : "C:/Repo");
});

test("herdr's main-checkout info makes a main space", () => {
  const k = classify({ label: "x", worktree: { repo_root: "/srv/repo", is_linked_worktree: false } }, []);
  assert.equal(k.kind, "main");
});

test("falls back to git: top level equal to the repo root means main", () => {
  assert.equal(classify({ label: "x" }, [null, { top: "C:/Repo", repoRoot: "C:/Repo" }]).kind, "main");
});

test("falls back to git: a different top level means a linked worktree", () => {
  const k = classify({ label: "x" }, [{ top: "D:/wt/y", repoRoot: "C:/Repo" }]);
  assert.equal(k.kind, "worktree");
  if (k.kind !== "other") assert.equal(k.folder, "D:/wt/y");
});

test("no git anywhere means other", () => {
  assert.equal(classify({ label: "home" }, [null, null]).kind, "other");
});
