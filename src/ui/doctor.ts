import { existsSync, readFileSync } from "node:fs";
import { run } from "../io/exec.ts";
import { Herdr } from "../io/herdr.ts";
import { ghStatus } from "../io/github.ts";
import { configDir, herdrConfigPath, loadConfig } from "../config.ts";
import { lockHeld, readPidLock, statePaths } from "../state.ts";
import { showMessage } from "./term.ts";

export interface Check { name: string; ok: boolean; detail: string }

export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

export { herdrConfigPath };

export function snippetChecks(toml: string | null): Check[] {
  if (toml === null) return [{ name: "herdr config.toml", ok: false, detail: "not found" }];
  return [
    { name: "sidebar rows", ok: toml.includes('"$hub1"'), detail: "add the [ui.sidebar.spaces] rows from the README" },
    { name: "menu hotkey", ok: toml.includes("herdr-hub.menu"), detail: "bind herdr-hub.menu (README)" },
    { name: "new worktree hotkey", ok: toml.includes("herdr-hub.new-worktree"), detail: "bind herdr-hub.new-worktree (README)" },
  ];
}

export async function runChecks(): Promise<Check[]> {
  const checks: Check[] = [];
  const node = process.versions.node;
  checks.push({ name: "Node", ok: compareVersions(node, "24.0.0") >= 0, detail: `${node} (needs 24 or newer)` });

  const git = await run("git", ["--version"]);
  checks.push({ name: "git", ok: git.code === 0, detail: git.code === 0 ? git.stdout.trim() : "not found" });

  const gh = await ghStatus();
  checks.push({ name: "GitHub CLI", ok: gh === "ok", detail: gh === "ok" ? "signed in" : gh === "missing" ? "not installed (https://cli.github.com)" : "run: gh auth login" });

  const hv = await new Herdr().version();
  checks.push({ name: "herdr", ok: !!hv && compareVersions(hv, "0.9.0") >= 0, detail: hv ? `${hv} (needs 0.9.0 or newer)` : "not found" });

  const toml = herdrConfigPath(configDir());
  checks.push(...snippetChecks(existsSync(toml) ? readFileSync(toml, "utf8") : null).map((c) => c.ok ? { ...c, detail: "ok" } : c));

  const { errors } = loadConfig(configDir());
  checks.push({ name: "config.json", ok: !errors.length, detail: errors.length ? errors.join("; ") : "ok" });

  const lock = statePaths().daemonLock;
  const pid = readPidLock(lock);
  const alive = lockHeld(lock);
  checks.push({ name: "sidebar updater", ok: alive, detail: alive ? `running (pid ${pid})` : "not running: use Refresh now" });
  return checks;
}

export async function runDoctor(): Promise<void> {
  const checks = await runChecks();
  await showMessage("Check setup", checks.map((c) => `${c.ok ? "✓" : "✗"} ${c.name}: ${c.detail}`));
}
