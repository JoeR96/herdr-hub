import { locate } from "./io/git.ts";
import type { Snapshot, Workspace } from "./io/herdr.ts";
import { classify } from "./model/classify.ts";
import type { Location, SpaceKind } from "./model/classify.ts";

const cache = new Map<string, { at: number; loc: Location | null }>();
const TTL = 60_000;

async function locationFor(cwd: string): Promise<Location | null> {
  const hit = cache.get(cwd);
  if (hit && Date.now() - hit.at < TTL) return hit.loc;
  const loc = await locate(cwd);
  cache.set(cwd, { at: Date.now(), loc });
  return loc;
}

export async function spaceKind(ws: Workspace, snap: Snapshot): Promise<SpaceKind> {
  if (ws.worktree?.repo_root) return classify(ws, []);
  const cwds = [...new Set(snap.panes.filter((p) => p.workspace_id === ws.workspace_id).map((p) => p.cwd).filter(Boolean))];
  const locations: (Location | null)[] = [];
  for (const cwd of cwds) locations.push(await locationFor(cwd));
  return classify(ws, locations);
}
