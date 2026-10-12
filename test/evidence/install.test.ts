import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { install } from "../../claude-evidence/install.ts";

const source = resolve("claude-evidence");
const herdrHook = { matcher: "^(startup|resume)$", hooks: [{ type: "command", command: "powershell herdr-agent-state.ps1 session", timeout: 10 }] };

function home(settings?: string): string {
  const h = mkdtempSync(join(tmpdir(), "ev-home-"));
  if (settings !== undefined) { mkdirSync(join(h, ".claude")); writeFileSync(join(h, ".claude", "settings.json"), settings); }
  return h;
}
const settingsOf = (h: string) => JSON.parse(readFileSync(join(h, ".claude", "settings.json"), "utf8"));
const backups = (h: string) => readdirSync(join(h, ".claude")).filter((f) => f.startsWith("settings.json.bak-evidence-"));

test("fresh install copies the tool, writes the skill and registers both hooks", () => {
  const h = home();
  const r = install({ home: h, source });
  assert.equal(r.settingsChanged, true);
  for (const f of ["evidence.ts", "lib/store.ts", "lib/hooks.ts", "hooks/stop.ts", "hooks/session-start.ts", "package.json"]) {
    assert.ok(existsSync(join(h, ".claude", "evidence", f)), f);
  }
  const skill = readFileSync(join(h, ".claude", "skills", "evidence", "SKILL.md"), "utf8");
  assert.ok(skill.includes(`${h.replace(/\\/g, "/")}/.claude/evidence/evidence.ts`));
  assert.equal(skill.includes("{{EVIDENCE}}"), false);
  const s = settingsOf(h);
  assert.match(s.hooks.Stop[0].hooks[0].command, /\/\.claude\/evidence\/hooks\/stop\.ts"$/);
  assert.ok(s.hooks.Stop[0].hooks[0].command.startsWith('node "'), "bare node works in bash, cmd and PowerShell");
  assert.match(s.hooks.SessionStart[0].hooks[0].command, /session-start\.ts"$/);
});

test("existing hooks and settings are kept, and a re-run changes nothing", () => {
  const h = home(JSON.stringify({ model: "opus", hooks: { SessionStart: [herdrHook] } }, null, 2));
  assert.equal(install({ home: h, source }).settingsChanged, true);
  const s = settingsOf(h);
  assert.equal(s.model, "opus");
  assert.equal(s.hooks.SessionStart.length, 2);
  assert.deepEqual(s.hooks.SessionStart[0], herdrHook);
  assert.equal(backups(h).length, 1);

  const again = install({ home: h, source });
  assert.equal(again.settingsChanged, false);
  assert.equal(settingsOf(h).hooks.SessionStart.length, 2);
  assert.equal(settingsOf(h).hooks.Stop.length, 1);
  assert.equal(backups(h).length, 1);
});

test("invalid settings.json is refused and left alone", () => {
  const h = home("{ not json");
  assert.throws(() => install({ home: h, source }), /settings\.json/);
  assert.equal(readFileSync(join(h, ".claude", "settings.json"), "utf8"), "{ not json");
});
