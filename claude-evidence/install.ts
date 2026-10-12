#!/usr/bin/env node
// Installs the evidence tool into ~/.claude: tool copy, skill, and SessionStart + Stop hooks.
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const fwd = (p: string) => p.replace(/\\/g, "/");
const MARK = "/.claude/evidence/hooks/";

interface HookGroup { matcher?: string; hooks: { type: string; command: string; timeout?: number }[] }

export function install(opts: { home: string; source: string }): { settingsChanged: boolean; backup: string | null } {
  const claude = join(opts.home, ".claude");
  const settingsPath = join(claude, "settings.json");
  let settings: { hooks?: Record<string, HookGroup[]> } = {};
  const original = existsSync(settingsPath) ? readFileSync(settingsPath, "utf8") : null;
  if (original !== null) {
    try { settings = JSON.parse(original); } catch { throw new Error(`${settingsPath} is not valid JSON - fix it and run the installer again`); }
  }

  const tool = join(claude, "evidence");
  mkdirSync(tool, { recursive: true });
  copyFileSync(join(opts.source, "evidence.ts"), join(tool, "evidence.ts"));
  cpSync(join(opts.source, "lib"), join(tool, "lib"), { recursive: true });
  cpSync(join(opts.source, "hooks"), join(tool, "hooks"), { recursive: true });
  writeFileSync(join(tool, "package.json"), '{ "type": "module" }\n');

  const skillDir = join(claude, "skills", "evidence");
  mkdirSync(skillDir, { recursive: true });
  const skill = readFileSync(join(opts.source, "SKILL.md"), "utf8").replaceAll("{{EVIDENCE}}", `${fwd(tool)}/evidence.ts`);
  writeFileSync(join(skillDir, "SKILL.md"), skill);

  const hooks = (settings.hooks ??= {});
  let changed = false;
  for (const [event, script] of [["SessionStart", "session-start.ts"], ["Stop", "stop.ts"]] as const) {
    const groups = (hooks[event] ??= []);
    if (groups.some((g) => g.hooks?.some((h) => fwd(h.command ?? "").includes(MARK)))) continue;
    groups.push({ hooks: [{ type: "command", command: `node "${fwd(tool)}/hooks/${script}"`, timeout: 10 }] });
    changed = true;
  }
  if (!changed) return { settingsChanged: false, backup: null };

  let backup: string | null = null;
  if (original !== null) {
    backup = `${settingsPath}.bak-evidence-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    writeFileSync(backup, original);
  }
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
  return { settingsChanged: true, backup };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const r = install({ home: homedir(), source: fileURLToPath(new URL(".", import.meta.url)) });
    process.stdout.write(`evidence installed to ${fwd(join(homedir(), ".claude", "evidence"))}\n`);
    process.stdout.write(r.settingsChanged ? `hooks added to settings.json (backup: ${r.backup ?? "none, file was new"})\n` : "hooks already registered\n");
  } catch (e) {
    process.stderr.write(`evidence install: ${(e as Error).message}\n`);
    process.exit(1);
  }
}
