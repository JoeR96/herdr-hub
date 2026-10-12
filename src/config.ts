import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface Pinned { label: string; path: string }
export interface Config {
  pinned: Pinned[];
  refresh: { localSeconds: number; githubSeconds: number };
  cleanup: { staleDays: number };
  releaseWorkflowPattern: string;
  newWorktree: { branchPrefix: string };
  indent: "blank" | "bar";
}

export function defaults(): Config {
  return {
    pinned: [],
    refresh: { localSeconds: 15, githubSeconds: 180 },
    cleanup: { staleDays: 30 },
    releaseWorkflowPattern: "release|deploy|publish",
    newWorktree: { branchPrefix: "feature/" },
    indent: "blank",
  };
}

export function parseConfig(text: string | null): { config: Config; errors: string[] } {
  const config = defaults();
  const errors: string[] = [];
  if (text === null || !text.trim()) return { config, errors };
  let raw: any;
  try { raw = JSON.parse(text); } catch (e) {
    return { config, errors: [`config.json is not valid JSON: ${(e as Error).message}`] };
  }

  if (Array.isArray(raw?.pinned)) {
    for (const p of raw.pinned) {
      const ok = p && typeof p.label === "string" && p.label.trim() && typeof p.path === "string" && p.path.trim();
      if (!ok) { errors.push(`pinned entry ignored: ${JSON.stringify(p)}`); continue; }
      if (config.pinned.some((q) => q.label === p.label.trim())) { errors.push(`duplicate pinned label ignored: ${p.label}`); continue; }
      config.pinned.push({ label: p.label.trim(), path: p.path.trim() });
    }
  } else if (raw?.pinned !== undefined) {
    errors.push("pinned must be a list");
  }

  const num = (v: unknown, name: string, min: number, fallback: number): number => {
    if (v === undefined) return fallback;
    if (typeof v === "number" && Number.isFinite(v) && v >= min) return v;
    errors.push(`${name} must be a number >= ${min}`);
    return fallback;
  };
  config.refresh.localSeconds = num(raw?.refresh?.localSeconds, "refresh.localSeconds", 5, 15);
  config.refresh.githubSeconds = num(raw?.refresh?.githubSeconds, "refresh.githubSeconds", 30, 180);
  config.cleanup.staleDays = num(raw?.cleanup?.staleDays, "cleanup.staleDays", 1, 30);

  if (raw?.releaseWorkflowPattern !== undefined) {
    try { new RegExp(String(raw.releaseWorkflowPattern), "i"); config.releaseWorkflowPattern = String(raw.releaseWorkflowPattern); }
    catch { errors.push("releaseWorkflowPattern is not a valid regular expression"); }
  }
  if (typeof raw?.newWorktree?.branchPrefix === "string") config.newWorktree.branchPrefix = raw.newWorktree.branchPrefix;
  if (raw?.indent === "blank" || raw?.indent === "bar") config.indent = raw.indent;
  else if (raw?.indent !== undefined) errors.push('indent must be "blank" or "bar"');

  return { config, errors };
}

export function configDir(): string {
  return process.env.HERDR_PLUGIN_CONFIG_DIR ?? join(homedir(), ".herdr-hub");
}

export function configFile(dir: string): string {
  return join(dir, "config.json");
}

export function loadConfig(dir: string): { config: Config; errors: string[] } {
  const file = configFile(dir);
  return parseConfig(existsSync(file) ? readFileSync(file, "utf8") : null);
}

export function saveConfig(dir: string, cfg: Config): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(configFile(dir), JSON.stringify(cfg, null, 2) + "\n");
}

// Rewrites only "pinned" in the user's own file, so values they're mid-way through editing (even invalid
// ones) survive. Refuses to touch a file that isn't valid JSON rather than replacing it with defaults.
export function savePinned(dir: string, pinned: Pinned[]): void {
  const file = configFile(dir);
  let raw: Record<string, unknown> = {};
  if (existsSync(file)) {
    const text = readFileSync(file, "utf8");
    if (text.trim()) {
      try { raw = JSON.parse(text); } catch (e) { throw new Error(`config.json is not valid JSON, so it was left alone: ${(e as Error).message}`); }
    }
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, JSON.stringify({ ...raw, pinned }, null, 2) + "\n");
}

export function togglePin(cfg: Config, label: string, path: string): { config: Config; pinned: boolean } {
  const has = cfg.pinned.some((p) => p.label === label);
  const pinned = has ? cfg.pinned.filter((p) => p.label !== label) : [...cfg.pinned, { label, path }];
  return { config: { ...cfg, pinned }, pinned: !has };
}

/** herdr's own config.toml, three levels above the plugin config dir. */
export function herdrConfigPath(pluginConfigDir: string): string {
  return join(pluginConfigDir, "..", "..", "..", "config.toml");
}

export function readHerdrConfig(pluginConfigDir: string): string | null {
  try { return readFileSync(herdrConfigPath(pluginConfigDir), "utf8"); } catch { return null; }
}
