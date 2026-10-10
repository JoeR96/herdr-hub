import { statSync } from "node:fs";
import { join } from "node:path";
import { run } from "./exec.ts";
import type { RunResult } from "./exec.ts";
import { parseStatusV2, parseWorktreeList, parseRevParse, parseGitHubRemote, repoRootFromCommonDir } from "../model/git-parse.ts";
import type { GitStatus, WorktreeEntry, GitHubRepo } from "../model/git-parse.ts";

export interface GitLocation { top: string; repoRoot: string }

function git(cwd: string, args: string[]): Promise<RunResult> {
  return run("git", ["-C", cwd, ...args], { timeoutMs: 60_000 });
}

export async function locate(dir: string): Promise<GitLocation | null> {
  const r = await git(dir, ["rev-parse", "--path-format=absolute", "--show-toplevel", "--git-common-dir"]);
  if (r.code !== 0) return null;
  const p = parseRevParse(r.stdout);
  return p ? { top: p.top, repoRoot: repoRootFromCommonDir(p.commonDir) } : null;
}

export async function status(dir: string): Promise<GitStatus | null> {
  const r = await git(dir, ["status", "--porcelain=v2", "--branch"]);
  return r.code === 0 ? parseStatusV2(r.stdout) : null;
}

export async function githubRepo(repo: string): Promise<GitHubRepo | null> {
  const r = await git(repo, ["remote", "get-url", "origin"]);
  return r.code === 0 ? parseGitHubRemote(r.stdout) : null;
}

export async function worktrees(repo: string): Promise<WorktreeEntry[]> {
  const r = await git(repo, ["worktree", "list", "--porcelain"]);
  return r.code === 0 ? parseWorktreeList(r.stdout) : [];
}

export async function defaultBranch(repo: string): Promise<string> {
  const r = await git(repo, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]);
  const ref = r.stdout.trim();
  return r.code === 0 && ref ? ref.replace(/^origin\//, "") : "main";
}

// origin/<default> when it exists locally, otherwise HEAD
export async function baseRef(repo: string): Promise<string> {
  const b = await defaultBranch(repo);
  const r = await git(repo, ["rev-parse", "--verify", "--quiet", `refs/remotes/origin/${b}`]);
  return r.code === 0 ? `origin/${b}` : "HEAD";
}

export async function tipOf(repo: string, ref: string): Promise<string | null> {
  const r = await git(repo, ["rev-parse", "--verify", "--quiet", ref]);
  return r.code === 0 ? r.stdout.trim() : null;
}

export async function mergedBranches(repo: string, base: string): Promise<Set<string>> {
  const r = await git(repo, ["branch", "--merged", base, "--format=%(refname:short)"]);
  return new Set(r.code === 0 ? r.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean) : []);
}

export async function headTime(dir: string): Promise<number | null> {
  const r = await git(dir, ["log", "-1", "--format=%ct"]);
  const n = Number(r.stdout.trim());
  return r.code === 0 && n > 0 ? n * 1000 : null;
}

// A linked worktree's .git file is written when the worktree is created.
export function createdTime(worktreePath: string): number | null {
  try { return statSync(join(worktreePath, ".git")).mtimeMs; } catch { return null; }
}

export async function fetchOrigin(repo: string): Promise<void> {
  await git(repo, ["fetch", "--quiet", "origin"]);
}

export function removeWorktree(repo: string, path: string): Promise<RunResult> {
  return git(repo, ["worktree", "remove", path]);
}

export function pruneWorktrees(repo: string): Promise<RunResult> {
  return git(repo, ["worktree", "prune"]);
}

export function deleteBranch(repo: string, branch: string): Promise<RunResult> {
  return git(repo, ["branch", "-d", branch]);
}
