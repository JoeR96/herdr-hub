import type { Item } from "./tty.ts";

export interface MenuInfo {
  kind: "main" | "worktree" | "other";
  prNumber: number | null;
  prUrl: string | null;
  releaseUrl: string | null;
  repoUrl: string | null;
  pinned: boolean;
}

export function menuItems(i: MenuInfo): Item[] {
  const here = "This space", tidy = "Tidy up", setup = "Setup";
  const items: Item[] = [{ id: "new-worktree", section: here, label: i.kind === "other" ? "New Claude tab" : "New worktree + Claude…", hint: "ctrl+shift+n" }];
  if (i.prUrl) items.push({ id: "open-pr", section: here, label: `Open PR #${i.prNumber} in browser` });
  if (i.releaseUrl) items.push({ id: "open-release", section: here, label: "Open latest release / CI run" });
  if (i.repoUrl) items.push({ id: "open-repo", section: here, label: "Open repo on GitHub" });
  items.push({ id: "cleanup", section: tidy, label: "Clean up workstreams…" }, { id: "refresh", section: tidy, label: "Refresh now" });
  if (i.kind !== "worktree") items.push({ id: "pin", section: setup, label: i.pinned ? "Unpin this space" : "Pin this space" });
  items.push({ id: "open-config", section: setup, label: "Open config file" }, { id: "doctor", section: setup, label: "Check setup" });
  return items;
}
