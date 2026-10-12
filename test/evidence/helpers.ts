import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-C", cwd, ...args], { encoding: "utf8" });
}

/** A temp repo (inside a folder whose name has a space) with one commit and a linked worktree on feature/x. */
export function repoWithWorktree(): { root: string; repo: string; wt: string } {
  const root = join(realpathSync.native(mkdtempSync(join(tmpdir(), "ev-"))), "with space");
  mkdirSync(root);
  const repo = join(root, "repo");
  execFileSync("git", ["init", "-q", "-b", "main", repo]);
  writeFileSync(join(repo, "a.txt"), "a");
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "init");
  const wt = join(root, "wt-x");
  git(repo, "worktree", "add", "-q", "-b", "feature/x", wt);
  assert.ok(wt);
  return { root, repo, wt };
}
