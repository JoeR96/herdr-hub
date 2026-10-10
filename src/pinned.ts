import { existsSync } from "node:fs";
import type { Herdr } from "./io/herdr.ts";
import type { Config, Pinned } from "./config.ts";
import { log, withFileLock } from "./state.ts";
import type { StatePaths } from "./state.ts";

export function missingPinned(pinned: Pinned[], openLabels: string[]): Pinned[] {
  const open = new Set(openLabels);
  return pinned.filter((p) => !open.has(p.label));
}

// Serialised with a lock file: a burst of workspace.closed events must not create duplicates.
export function restorePinned(herdr: Herdr, cfg: Config, paths: StatePaths): Promise<string[]> {
  return withFileLock(paths.pinnedLock, async () => {
    if (!cfg.pinned.length) return [];
    const snap = await herdr.snapshot();
    const created: string[] = [];
    for (const p of missingPinned(cfg.pinned, snap.workspaces.map((w) => w.label))) {
      if (!existsSync(p.path)) { log(paths, `pinned "${p.label}" skipped: ${p.path} not found`); continue; }
      await herdr.createWorkspace(p.path, p.label);
      created.push(p.label);
    }
    if (created.length) log(paths, `restored pinned spaces: ${created.join(", ")}`);
    return created;
  });
}
