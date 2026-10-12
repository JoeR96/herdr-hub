import { Herdr } from "./io/herdr.ts";
import { configDir, loadConfig } from "./config.ts";
import { log, statePaths } from "./state.ts";
import { restorePinned } from "./pinned.ts";
import { ensureDaemon } from "./daemon-control.ts";

const paths = statePaths();
try {
  const { config, errors } = loadConfig(configDir());
  for (const e of errors) log(paths, `config: ${e}`);
  await restorePinned(new Herdr(), config, paths);
} catch (e) {
  log(paths, `startup: ${(e as Error).message}`);
}
ensureDaemon(paths);
