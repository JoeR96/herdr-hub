import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { repoWithWorktree } from "./helpers.ts";
import { gitInfo } from "../../claude-evidence/lib/git.ts";
import { addItem, markPublished } from "../../claude-evidence/lib/store.ts";
import { sessionStartOutput, stopOutput } from "../../claude-evidence/lib/hooks.ts";

const now = new Date();
const addNote = (wt: string) => { const i = gitInfo(wt)!; addItem(i.top, i.commonDir, { kind: "note", caption: "n", source: null, now }); };

test("main checkouts get nothing from either hook", () => {
  const { repo } = repoWithWorktree();
  assert.equal(sessionStartOutput(repo), null);
  assert.equal(stopOutput({ cwd: repo }), null);
});

test("session start in a worktree adds a reminder naming the branch", () => {
  const { wt } = repoWithWorktree();
  const out = sessionStartOutput(join(wt)) as { hookSpecificOutput: { hookEventName: string; additionalContext: string } };
  assert.equal(out.hookSpecificOutput.hookEventName, "SessionStart");
  assert.match(out.hookSpecificOutput.additionalContext, /feature\/x/);
  assert.match(out.hookSpecificOutput.additionalContext, /evidence/);
  assert.ok(out.hookSpecificOutput.additionalContext.includes(`${homedir().replace(/\\/g, "/")}/.claude/evidence/evidence.ts`));
  assert.equal(out.hookSpecificOutput.additionalContext.includes("~"), false);
});

test("stop blocks once per turn while evidence is unpublished, from any subfolder", () => {
  const { wt } = repoWithWorktree();
  const sub = join(wt, "deep", "er");
  mkdirSync(sub, { recursive: true });
  assert.equal(stopOutput({ cwd: sub }), null);
  addNote(wt);
  const out = stopOutput({ cwd: sub }) as { decision: string; reason: string };
  assert.equal(out.decision, "block");
  assert.match(out.reason, /1 unpublished/);
  assert.equal(stopOutput({ cwd: sub, stop_hook_active: true }), null);
  markPublished(gitInfo(wt)!.top, "https://claude.ai/artifact/x", now);
  assert.equal(stopOutput({ cwd: sub }), null);
});

test("hook scripts exit 0 silently on garbage or empty input", () => {
  for (const script of ["stop.ts", "session-start.ts"]) {
    for (const input of ["garbage", "", '{"cwd": 5}']) {
      const r = spawnSync(process.execPath, [resolve("claude-evidence/hooks", script)], { input, encoding: "utf8" });
      assert.equal(r.status, 0, `${script} ${JSON.stringify(input)}: ${r.stderr}`);
      assert.equal(r.stdout, "");
    }
  }
});

test("hook script prints the block decision as JSON", () => {
  const { wt } = repoWithWorktree();
  addNote(wt);
  const r = spawnSync(process.execPath, [resolve("claude-evidence/hooks/stop.ts")], { input: JSON.stringify({ cwd: wt }), encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.equal(JSON.parse(r.stdout).decision, "block");
});
