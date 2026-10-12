import { basename } from "node:path";
import type { Herdr } from "./io/herdr.ts";
import { baseRef, createdTime, githubRepo, headTime, locate, mergedBranches, onAnyRef, status, tipOf, worktrees } from "./io/git.ts";
import { mergedPrBranches, openPrBranches } from "./io/github.ts";
import type { Config } from "./config.ts";
import { findCandidates, mapUsage } from "./model/cleanup.ts";
import type { Candidate } from "./model/cleanup.ts";
import type { SpaceKind } from "./model/classify.ts";
import { normPath } from "./model/paths.ts";
import { spaceKind } from "./locate.ts";

export interface Row extends Candidate { repoRoot: string; repoName: string }

export async function gatherRows(herdr: Herdr, config: Config): Promise<Row[]> {
  const snap = await herdr.snapshot();
  const kinds = new Map<string, SpaceKind>();
  for (const ws of snap.workspaces) kinds.set(ws.workspace_id, await spaceKind(ws, snap));

  const repos = new Map<string, string>(); // repoKey -> repoRoot
  for (const k of kinds.values()) if (k.kind !== "other") repos.set(k.repoKey, k.repoRoot);
  for (const p of config.pinned) {
    const loc = await locate(p.path);
    if (loc) repos.set(normPath(loc.repoRoot), loc.repoRoot);
  }

  const ownSpace = new Map<string, string>();
  for (const ws of snap.workspaces) {
    const k = kinds.get(ws.workspace_id)!;
    if (k.kind === "worktree") ownSpace.set(normPath(k.folder), ws.workspace_id);
  }
  const labels = new Map(snap.workspaces.map((w) => [w.workspace_id, w.label]));
  const panes = snap.panes.map((p) => ({ workspaceId: p.workspace_id, label: labels.get(p.workspace_id) ?? p.workspace_id, paneId: p.pane_id, cwd: p.cwd ?? "" }));
  const agentPanes = new Set(snap.agents.map((a) => a.pane_id));

  const rows: Row[] = [];
  for (const repoRoot of repos.values()) {
    const list = await worktrees(repoRoot);
    if (list.length < 2) continue;
    const base = await baseRef(repoRoot);
    const gh = await githubRepo(repoRoot);
    let mergedPrs = new Map<string, number>();
    let openPrs = new Set<string>();
    if (gh) {
      mergedPrs = await mergedPrBranches(gh.owner, gh.name).catch(() => new Map<string, number>());
      openPrs = await openPrBranches(gh.owner, gh.name).catch(() => new Set<string>());
    }
    const headMs = new Map<string, number>();
    const createdMs = new Map<string, number>();
    const dirty = new Map<string, boolean>();
    const detachedSafe = new Set<string>();
    for (const w of list) {
      if (w.isMain || w.prunable) continue;
      const key = normPath(w.path);
      const h = await headTime(w.path);
      if (h) headMs.set(key, h);
      const c = createdTime(w.path);
      if (c) createdMs.set(key, c);
      // if git can't read it, treat it as dirty so it can't be removed
      dirty.set(key, (await status(w.path))?.dirty ?? true);
      if (w.branch === null && w.head && await onAnyRef(repoRoot, w.head)) detachedSafe.add(key);
    }
    const candidates = findCandidates({
      worktrees: list, baseTip: await tipOf(repoRoot, base), merged: await mergedBranches(repoRoot, base),
      mergedPrs, openPrBranches: openPrs, headMs, createdMs, dirty, detachedSafe,
      usage: mapUsage(list.filter((w) => !w.isMain).map((w) => w.path), panes, ownSpace, agentPanes),
      staleDays: config.cleanup.staleDays, now: Date.now(),
    });
    rows.push(...candidates.map((c) => ({ ...c, repoRoot, repoName: basename(repoRoot) })));
  }
  return rows;
}
