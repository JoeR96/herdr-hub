import { Herdr } from "./io/herdr.ts";
import { configDir, loadConfig } from "./config.ts";
import { log, statePaths, touchTrigger } from "./state.ts";
import { restorePinned } from "./pinned.ts";
import { ensureDaemon } from "./daemon-control.ts";

// Event hooks (workspace.closed / workspace.created / worktree.created) and the refresh action.
const event = process.env.HERDR_PLUGIN_EVENT ?? process.argv[2] ?? "refresh";
const paths = statePaths();
if (event === "workspace.closed") {
  try { await restorePinned(new Herdr(), loadConfig(configDir()).config, paths); }
  catch (e) { log(paths, `restore pinned: ${(e as Error).message}`); }
}
touchTrigger(paths);
ensureDaemon(paths);
