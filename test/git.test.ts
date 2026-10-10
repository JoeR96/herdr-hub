import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/io/exec.ts";
import { locate, status, worktrees, mergedBranches, headTime } from "../src/io/git.ts";
import { samePath } from "../src/model/paths.ts";

async function git(cwd: string, ...args: string[]) {
  const r = await run("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-C", cwd, ...args]);
  assert.equal(r.code, 0, r.stderr);
  return r.stdout;
}

test("git helpers read a real repo with a linked worktree", async () => {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "hub-git-")));
  const repo = join(root, "repo");
  await run("git", ["init", "-b", "main", repo]);
  writeFileSync(join(repo, "a.txt"), "a");
  await git(repo, "add", ".");
  await git(repo, "commit", "-m", "init");
  const wt = join(root, "wt-x");
  await git(repo, "worktree", "add", "-b", "feature/x", wt);

  const main = await locate(repo);
  assert.ok(main && samePath(main.top, main.repoRoot));
  const linked = await locate(wt);
  assert.ok(linked && samePath(linked.repoRoot, repo) && samePath(linked.top, wt));
  assert.equal(await locate(root), null);

  const list = await worktrees(repo);
  assert.equal(list.length, 2);
  assert.equal(list[1].branch, "feature/x");

  assert.equal((await status(wt))?.dirty, false);
  writeFileSync(join(wt, "b.txt"), "b");
  assert.equal((await status(wt))?.dirty, true);
  assert.equal((await status(wt))?.branch, "feature/x");

  assert.ok((await mergedBranches(repo, "main")).has("feature/x"));
  assert.ok(((await headTime(wt)) ?? 0) > 0);
});
