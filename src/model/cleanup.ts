import type { WorktreeEntry } from "./git-parse.ts";
import { normPath } from "./paths.ts";

export type Reason = "missing" | "merged" | "pr-merged" | "stale";
export interface Usage { ownSpace: string | null; otherSpaces: string[]; agentCount: number }
// All maps are keyed by normPath(worktree path).
export interface CleanupInput {
  worktrees: WorktreeEntry[];
  baseTip: string | null;
  merged: Set<string>;
  mergedPrs: Map<string, number>;
  openPrBranches: Set<string>;
  headMs: Map<string, number>;
  createdMs: Map<string, number>;
  dirty: Map<string, boolean>;
  // detached worktrees whose HEAD is contained in some branch, tag or remote ref
  detachedSafe: Set<string>;
  usage: Map<string, Usage>;
  staleDays: number;
  now: number;
}
export interface Candidate {
  path: string;
  branch: string | null;
  reason: Reason;
  detail: string;
  dirty: boolean;
  orphanCommits: boolean;
  workspaceId: string | null;
  otherSpaces: string[];
  agentCount: number;
  selectable: boolean;
}

const ORDER: Reason[] = ["missing", "merged", "pr-merged", "stale"];
const DAY = 86_400_000;

export function findCandidates(i: CleanupInput): Candidate[] {
  const out: Candidate[] = [];
  for (const w of i.worktrees) {
    if (w.isMain) continue;
    const key = normPath(w.path);
    const usage = i.usage.get(key);
    const common = { path: w.path, branch: w.branch, workspaceId: usage?.ownSpace ?? null, otherSpaces: usage?.otherSpaces ?? [], agentCount: usage?.agentCount ?? 0 };

    if (w.prunable) {
      out.push({ ...common, reason: "missing", detail: "folder missing", dirty: false, orphanCommits: false, selectable: true });
      continue;
    }

    const hasOpenPr = !!w.branch && i.openPrBranches.has(w.branch);
    const head = i.headMs.get(key);
    const created = i.createdMs.get(key);
    // "merged" means work was committed here and has landed; a branch that never committed has nothing to merge
    const committedHere = created === undefined || (head ?? 0) > created;
    let reason: Reason | null = null;
    let detail = "";
    if (w.branch && i.merged.has(w.branch) && w.head !== i.baseTip && committedHere) {
      reason = "merged"; detail = "merged";
    } else if (w.branch && i.mergedPrs.has(w.branch) && !hasOpenPr) {
      reason = "pr-merged"; detail = `PR #${i.mergedPrs.get(w.branch)} merged`;
    } else if (!hasOpenPr) {
      const last = Math.max(head ?? 0, created ?? 0);
      const days = last ? Math.floor((i.now - last) / DAY) : 0;
      if (days >= i.staleDays) { reason = "stale"; detail = `stale ${days} days`; }
    }
    if (!reason) continue;

    const dirty = i.dirty.get(key) ?? false;
    // git worktree remove only checks status; commits reachable from nothing but this HEAD would be lost
    const orphanCommits = w.branch === null && !i.detachedSafe.has(key);
    out.push({ ...common, reason, detail, dirty, orphanCommits, selectable: !dirty && !orphanCommits && !common.otherSpaces.length });
  }
  return out.sort((a, b) => ORDER.indexOf(a.reason) - ORDER.indexOf(b.reason) || a.path.localeCompare(b.path));
}

export function warnings(c: Candidate): string[] {
  const w: string[] = [];
  if (c.dirty) w.push("dirty: has uncommitted changes");
  if (c.orphanCommits) w.push("detached: commits not on any branch");
  if (c.otherSpaces.length) w.push(`in use by ${c.otherSpaces.join(", ")}`);
  if (c.agentCount) w.push("agent running: will be stopped");
  return w;
}

// Which spaces have a pane inside each worktree folder, and how many agents would stop.
export function mapUsage(
  worktreePaths: string[],
  panes: { workspaceId: string; label: string; paneId: string; cwd: string }[],
  ownSpace: Map<string, string>,
  agentPanes: Set<string>,
): Map<string, Usage> {
  const usage = new Map<string, Usage>();
  for (const p of worktreePaths) {
    const key = normPath(p);
    usage.set(key, { ownSpace: ownSpace.get(key) ?? null, otherSpaces: [], agentCount: 0 });
  }
  for (const pane of panes) {
    const cwd = normPath(pane.cwd);
    for (const [key, u] of usage) {
      const inside = cwd === key || cwd.startsWith(key + "/");
      if (!inside && pane.workspaceId !== u.ownSpace) continue;
      if (agentPanes.has(pane.paneId)) u.agentCount++;
      if (inside && pane.workspaceId !== u.ownSpace && !u.otherSpaces.includes(pane.label)) u.otherSpaces.push(pane.label);
    }
  }
  return usage;
}
