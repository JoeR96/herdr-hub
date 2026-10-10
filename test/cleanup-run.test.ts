import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/io/exec.ts";
import { runCleanupActions } from "../src/cleanup-run.ts";
import type { Row } from "../src/cleanup-gather.ts";

async function git(cwd: string, ...args: string[]) {
  const r = await run("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-C", cwd, ...args]);
  assert.equal(r.code, 0, r.stderr);
  return r.stdout;
}

async function repoWithCommit(prefix: string): Promise<{ root: string; repo: string }> {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), prefix)));
  const repo = join(root, "repo");
  await run("git", ["init", "-b", "main", repo]);
  writeFileSync(join(repo, "a.txt"), "a");
  await git(repo, "add", ".");
  await git(repo, "commit", "-m", "init");
  return { root, repo };
}

const row = (repoRoot: string, path: string, branch: string, over: Partial<Row> = {}): Row => ({
  path, branch, reason: "merged", detail: "merged", dirty: false, workspaceId: null, agentCount: 0, selectable: true,
  repoRoot, repoName: "repo", ...over,
});
const noHerdr = { closeWorkspace: async () => {} };

test("removes worktrees, deletes merged branches only when asked, keeps unmerged branches", async () => {
  const { root, repo } = await repoWithCommit("hub-clean-");
  const merged = join(root, "wt-merged");
  await git(repo, "worktree", "add", "-b", "feature/merged", merged);
  writeFileSync(join(merged, "m.txt"), "m");
  await git(merged, "add", ".");
  await git(merged, "commit", "-m", "m");
  await git(repo, "merge", "--ff-only", "feature/merged");

  const unmerged = join(root, "wt-unmerged");
  await git(repo, "worktree", "add", "-b", "feature/unmerged", unmerged);
  writeFileSync(join(unmerged, "u.txt"), "u");
  await git(unmerged, "add", ".");
  await git(unmerged, "commit", "-m", "u");

  const closed: string[] = [];
  const fakeHerdr = { closeWorkspace: async (id: string) => { closed.push(id); } };
  const out = await runCleanupActions(fakeHerdr,
    [row(repo, merged, "feature/merged", { workspaceId: "w5" }), row(repo, unmerged, "feature/unmerged", { reason: "stale", detail: "stale" })],
    new Set([merged, unmerged]), 0);

  assert.deepEqual(closed, ["w5"]);
  assert.equal(existsSync(merged), false);
  assert.equal(existsSync(unmerged), false);
  const branches = await git(repo, "branch", "--format=%(refname:short)");
  assert.ok(!branches.includes("feature/merged"));
  assert.ok(branches.includes("feature/unmerged"), "unmerged branch must survive git branch -d");
  assert.ok(out.some((l) => l.startsWith("✓") && l.includes("branch feature/merged deleted")));
  assert.ok(out.some((l) => l.startsWith("✗") && l.includes("kept branch feature/unmerged")));
});

test("a dirty worktree is refused by git and reported, not forced", async () => {
  const { root, repo } = await repoWithCommit("hub-dirty-");
  const wt = join(root, "wt");
  await git(repo, "worktree", "add", "-b", "feature/x", wt);
  writeFileSync(join(wt, "untracked.txt"), "x");

  const out = await runCleanupActions(noHerdr, [row(repo, wt, "feature/x")], new Set(), 0);
  assert.equal(existsSync(wt), true);
  assert.ok(out[0].startsWith("✗"), out[0]);
});

test("a folder that is briefly locked after git unregisters it is still removed", async () => {
  const { root, repo } = await repoWithCommit("hub-locked-");
  const wt = join(root, "wt");
  await git(repo, "worktree", "add", "-b", "feature/locked", wt);
  // on Windows a process whose working folder is inside blocks deletion, like a pane's shell that hasn't exited yet
  const holder = spawn(process.execPath, ["-e", "setTimeout(() => {}, 1200)"], { cwd: wt, stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 200));

  const out = await runCleanupActions(noHerdr, [row(repo, wt, "feature/locked")], new Set(), 0);
  assert.equal(existsSync(wt), false, out.join("\n"));
  assert.ok(out[0].startsWith("✓"), out[0]);
  assert.ok(!(await git(repo, "worktree", "list")).includes("wt"));
});
