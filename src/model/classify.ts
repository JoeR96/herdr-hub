import { cleanPath, normPath, samePath } from "./paths.ts";

export interface WorkspaceLike { label: string; worktree?: { repo_root?: string; checkout_path?: string; is_linked_worktree?: boolean } | null }
export interface Location { top: string; repoRoot: string }
export type SpaceKind =
  | { kind: "main" | "worktree"; repoRoot: string; repoKey: string; folder: string }
  | { kind: "other" };

// herdr only records repo info after a worktree command touched the space, so git locations are the fallback.
export function classify(ws: WorkspaceLike, locations: (Location | null)[]): SpaceKind {
  const wt = ws.worktree;
  if (wt?.repo_root) {
    const repoRoot = cleanPath(wt.repo_root);
    if (wt.is_linked_worktree && wt.checkout_path) {
      return { kind: "worktree", repoRoot, repoKey: normPath(repoRoot), folder: cleanPath(wt.checkout_path) };
    }
    if (!wt.is_linked_worktree) return { kind: "main", repoRoot, repoKey: normPath(repoRoot), folder: repoRoot };
  }
  const loc = locations.find((l): l is Location => l !== null);
  if (!loc) return { kind: "other" };
  return {
    kind: samePath(loc.top, loc.repoRoot) ? "main" : "worktree",
    repoRoot: loc.repoRoot,
    repoKey: normPath(loc.repoRoot),
    folder: loc.top,
  };
}
