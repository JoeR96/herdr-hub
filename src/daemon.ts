import { watch } from "node:fs";
import { basename, dirname } from "node:path";
import { Herdr } from "./io/herdr.ts";
import { status, githubRepo } from "./io/git.ts";
import { ghStatus, fetchRepoData } from "./io/github.ts";
import type { GitHubRepo } from "./model/git-parse.ts";
import type { SpaceKind } from "./model/classify.ts";
import { buildLines, toTokens } from "./model/lines.ts";
import { configDir, loadConfig } from "./config.ts";
import { acquirePidLock, log, readCache, releasePidLock, statePaths, writeCache } from "./state.ts";
import { spaceKind } from "./locate.ts";

const paths = statePaths();
if (!acquirePidLock(paths.daemonLock)) process.exit(0);
process.on("exit", () => releasePidLock(paths.daemonLock));
process.on("SIGTERM", () => process.exit(0));

const herdr = new Herdr();
const repoOf = new Map<string, GitHubRepo | null>();
let ghProblem: string | null = null;
let forceGithub = true;
let failures = 0;

async function repoFor(repoRoot: string): Promise<GitHubRepo | null> {
  if (!repoOf.has(repoRoot)) repoOf.set(repoRoot, await githubRepo(repoRoot));
  return repoOf.get(repoRoot) ?? null;
}

async function tick(): Promise<void> {
  const { config } = loadConfig(configDir());
  const pattern = new RegExp(config.releaseWorkflowPattern, "i");
  const snap = await herdr.snapshot();
  const now = Date.now();
  const cache = readCache(paths);

  const kinds = new Map<string, SpaceKind>();
  for (const ws of snap.workspaces) kinds.set(ws.workspace_id, await spaceKind(ws, snap));

  const slugs = new Set<string>();
  for (const k of kinds.values()) {
    if (k.kind === "other") continue;
    const r = await repoFor(k.repoRoot);
    if (r) slugs.add(`${r.owner}/${r.name}`);
  }
  const due = [...slugs].filter((s) => forceGithub || now - (cache.repos[s]?.fetchedAt ?? 0) >= config.refresh.githubSeconds * 1000);
  if (due.length) {
    const gh = await ghStatus();
    ghProblem = gh === "ok" ? null : gh === "missing" ? "gh not installed" : "gh not signed in";
    if (!ghProblem) {
      for (const slug of due) {
        const [owner, name] = slug.split("/");
        try {
          cache.repos[slug] = { data: await fetchRepoData(owner, name, pattern), fetchedAt: now, error: null };
        } catch (e) {
          const error = (e as Error).message;
          cache.repos[slug] = { data: cache.repos[slug]?.data ?? null, fetchedAt: now, error };
          log(paths, `github ${slug}: ${error}`);
        }
      }
      writeCache(paths, cache);
    }
    forceGithub = false;
  }

  const ttl = Math.max(30_000, config.refresh.localSeconds * 2000);
  for (const ws of snap.workspaces) {
    const k = kinds.get(ws.workspace_id)!;
    if (k.kind === "other") {
      if (Object.keys(ws.tokens ?? {}).some((t) => t.startsWith("hub"))) await herdr.reportTokens(ws.workspace_id, toTokens([]), ttl);
      continue;
    }
    const r = await repoFor(k.repoRoot);
    const entry = r ? cache.repos[`${r.owner}/${r.name}`] : undefined;
    const git = await status(k.folder);
    const agents = snap.agents
      .filter((a) => a.workspace_id === ws.workspace_id)
      .map((a) => ({ kind: a.agent, title: a.terminal_title_stripped || a.name || a.agent, state: a.agent_status }));
    const pr = k.kind === "worktree" && git?.branch ? entry?.data?.prs.find((p) => p.headRefName === git.branch) ?? null : null;
    const lines = buildLines({
      kind: k.kind, git, agents, pr,
      release: k.kind === "main" ? entry?.data?.release ?? null : null,
      ghProblem: r ? ghProblem : null,
      stale: !!entry?.error, now, indent: config.indent,
    });
    await herdr.reportTokens(ws.workspace_id, toTokens(lines), ttl);
  }
}

function waitForTrigger(ms: number): Promise<void> {
  return new Promise((resolve) => {
    let watcher: ReturnType<typeof watch> | undefined;
    const finish = () => { clearTimeout(timer); watcher?.close(); resolve(); };
    const timer = setTimeout(finish, ms);
    try {
      watcher = watch(dirname(paths.trigger), (_event, file) => {
        if (file && String(file) === basename(paths.trigger)) { forceGithub = true; finish(); }
      });
    } catch { /* no fs.watch here: the timer still refreshes */ }
  });
}

async function main(): Promise<void> {
  log(paths, `daemon started (pid ${process.pid})`);
  for (;;) {
    try {
      await tick();
      failures = 0;
    } catch (e) {
      failures++;
      log(paths, `refresh failed (${failures}/3): ${(e as Error).message}`);
      if (failures >= 3) { log(paths, "herdr unreachable, daemon exiting"); process.exit(0); }
    }
    await waitForTrigger(loadConfig(configDir()).config.refresh.localSeconds * 1000);
  }
}

main();
