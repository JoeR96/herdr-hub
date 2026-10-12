import { test } from "node:test";
import assert from "node:assert/strict";
import { parseStatusV2, parseWorktreeList, parseGitHubRemote, parseRevParse, repoRootFromCommonDir } from "../src/model/git-parse.ts";

test("parseStatusV2 reads branch, upstream, ahead/behind and dirtiness", () => {
  const s = parseStatusV2("# branch.oid abc\n# branch.head main\n# branch.upstream origin/main\n# branch.ab +2 -1\n1 .M N... 100644 100644 100644 a b src/x.ts\n");
  assert.deepEqual(s, { branch: "main", upstream: "origin/main", ahead: 2, behind: 1, dirty: true });
});

test("parseStatusV2 handles a clean detached checkout with no upstream", () => {
  const s = parseStatusV2("# branch.oid abc\n# branch.head (detached)\n");
  assert.deepEqual(s, { branch: null, upstream: null, ahead: 0, behind: 0, dirty: false });
});

test("parseStatusV2 counts untracked files as dirty", () => {
  assert.equal(parseStatusV2("# branch.head main\n? new.txt\n").dirty, true);
});

test("parseWorktreeList reads main, linked, detached and prunable worktrees", () => {
  const text = [
    "worktree /repo", "HEAD aaa", "branch refs/heads/main", "",
    "worktree /wt/feature-x", "HEAD bbb", "branch refs/heads/feature/x", "",
    "worktree /wt/detached", "HEAD ccc", "detached", "",
    "worktree /wt/gone", "HEAD ddd", "branch refs/heads/old", "prunable gitdir file points to non-existent location", "",
  ].join("\n");
  assert.deepEqual(parseWorktreeList(text), [
    { path: "/repo", head: "aaa", branch: "main", prunable: false, isMain: true },
    { path: "/wt/feature-x", head: "bbb", branch: "feature/x", prunable: false, isMain: false },
    { path: "/wt/detached", head: "ccc", branch: null, prunable: false, isMain: false },
    { path: "/wt/gone", head: "ddd", branch: "old", prunable: true, isMain: false },
  ]);
});

test("parseWorktreeList copes with Windows line endings", () => {
  const list = parseWorktreeList("worktree C:/repo\r\nHEAD aaa\r\nbranch refs/heads/main\r\n\r\n");
  assert.equal(list[0].path, "C:/repo");
});

test("parseGitHubRemote accepts https, ssh and scp-style GitHub URLs", () => {
  assert.deepEqual(parseGitHubRemote("https://github.com/acme/widgets.git"), { owner: "acme", name: "widgets" });
  assert.deepEqual(parseGitHubRemote("https://github.com/acme/my.site\n"), { owner: "acme", name: "my.site" });
  assert.deepEqual(parseGitHubRemote("git@github.com:acme/widgets.git"), { owner: "acme", name: "widgets" });
  assert.deepEqual(parseGitHubRemote("ssh://git@github.com/acme/widgets"), { owner: "acme", name: "widgets" });
});

test("parseGitHubRemote rejects other hosts", () => {
  assert.equal(parseGitHubRemote("https://gitlab.com/acme/widgets.git"), null);
  assert.equal(parseGitHubRemote(""), null);
});

test("parseRevParse and repoRootFromCommonDir find the main repo folder", () => {
  assert.deepEqual(parseRevParse("C:/wt/x\nC:/repo/.git\n"), { top: "C:/wt/x", commonDir: "C:/repo/.git" });
  assert.equal(parseRevParse("only-one-line\n"), null);
  assert.equal(repoRootFromCommonDir("C:/repo/.git"), "C:/repo");
  assert.equal(repoRootFromCommonDir("/srv/repo/.git/"), "/srv/repo");
});
