import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { pidAlive, readPidLock } from "./state.ts";
import type { StatePaths } from "./state.ts";

// herdr startup hooks must exit, so the updater runs as a detached process guarded by a pid lock.
export function ensureDaemon(paths: StatePaths): boolean {
  const pid = readPidLock(paths.daemonLock);
  if (pid && pidAlive(pid)) return false;
  const script = fileURLToPath(new URL("./daemon.ts", import.meta.url));
  const child = spawn(process.execPath, [script], { detached: true, stdio: "ignore", windowsHide: true, env: process.env });
  child.unref();
  return true;
}
