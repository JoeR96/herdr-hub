import type { WorktreeEntry } from "./git-parse.ts";
import { normPath } from "./paths.ts";

export type Reason = "missing" | "merged" | "pr-merged" | "stale";
export interface CleanupInput {
  worktrees: WorktreeEntry[];
  baseTip: string | null;
  merged: Set<string>;
  mergedPrs: Map<string, number>;
  openPrBranches: Set<string>;
  activityMs: Map<string, number>;
  dirty: Map<string, boolean>;
  spaces: Map<string, { workspaceId: string; agentCount: number }>;
  staleDays: number;
  now: number;
}
export interface Candidate {
  path: string;
  branch: string | null;
  reason: Reason;
  detail: string;
  dirty: boolean;
  workspaceId: string | null;
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
    const space = i.spaces.get(key);
    const common = { path: w.path, branch: w.branch, workspaceId: space?.workspaceId ?? null, agentCount: space?.agentCount ?? 0 };

    if (w.prunable) {
      out.push({ ...common, reason: "missing", detail: "folder missing", dirty: false, selectable: true });
      continue;
    }

    const hasOpenPr = !!w.branch && i.openPrBranches.has(w.branch);
    let reason: Reason | null = null;
    let detail = "";
    // a worktree still sitting on the base tip has no work of its own yet: it's new, not merged
    if (w.branch && i.merged.has(w.branch) && w.head !== i.baseTip) {
      reason = "merged"; detail = "merged";
    } else if (w.branch && i.mergedPrs.has(w.branch) && !hasOpenPr) {
      reason = "pr-merged"; detail = `PR #${i.mergedPrs.get(w.branch)} merged`;
    } else if (!hasOpenPr) {
      const last = i.activityMs.get(key);
      const days = last === undefined ? 0 : Math.floor((i.now - last) / DAY);
      if (days >= i.staleDays) { reason = "stale"; detail = `stale ${days} days`; }
    }
    if (!reason) continue;

    const dirty = i.dirty.get(key) ?? false;
    out.push({ ...common, reason, detail, dirty, selectable: !dirty });
  }
  return out.sort((a, b) => ORDER.indexOf(a.reason) - ORDER.indexOf(b.reason) || a.path.localeCompare(b.path));
}

export function warnings(c: Candidate): string[] {
  const w: string[] = [];
  if (c.dirty) w.push("dirty: has uncommitted changes");
  if (c.agentCount) w.push("agent running: will be stopped");
  return w;
}
