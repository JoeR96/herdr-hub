import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { repoWithWorktree } from "./helpers.ts";

const CLI = resolve("claude-evidence/evidence.ts");
const ev = (cwd: string, args: string[], input?: string) =>
  spawnSync(process.execPath, [CLI, ...args], { cwd, input, encoding: "utf8" });

test("add, build, published and status work from a worktree subfolder", () => {
  const { wt } = repoWithWorktree();
  const sub = join(wt, "src");
  mkdirSync(sub);
  writeFileSync(join(sub, "shot.png"), "png");

  assert.equal(ev(sub, ["add", "shot.png", "--caption", "Home page"]).status, 0);
  const piped = ev(sub, ["add", "-", "--kind", "test-output", "--caption", "npm test"], "ok 1\n");
  assert.equal(piped.status, 0, piped.stderr);
  assert.equal(ev(sub, ["add", "--kind", "note", "--caption", "Checked by hand"]).status, 0);

  const built = ev(sub, ["build"]);
  assert.equal(built.status, 0, built.stderr);
  const out = JSON.parse(built.stdout);
  assert.ok(existsSync(out.page));
  assert.deepEqual(Object.keys(out.files), ["files/1-home-page.png"]);
  assert.equal(out.url, null);

  assert.equal(ev(sub, ["published", "https://claude.ai/artifact/x"]).status, 0);
  const status = JSON.parse(ev(sub, ["status"]).stdout);
  assert.deepEqual([status.unpublished, status.url], [0, "https://claude.ai/artifact/x"]);
  assert.equal(JSON.parse(ev(sub, ["build"]).stdout).url, "https://claude.ai/artifact/x");
});

test("bad input exits 1 with a message", () => {
  const { wt } = repoWithWorktree();
  const outside = mkdtempSync(join(tmpdir(), "ev-out-"));
  const r1 = ev(outside, ["add", "-", "--caption", "x"], "x");
  assert.equal(r1.status, 1);
  assert.match(r1.stderr, /git/);
  const r2 = ev(wt, ["add", "missing.png", "--caption", "x"]);
  assert.equal(r2.status, 1);
  assert.equal(ev(wt, ["add", "-", "--kind", "bogus", "--caption", "x"], "x").status, 1);
  assert.equal(ev(wt, ["add", "--caption", "no source and not a note"]).status, 1);
  assert.equal(ev(wt, ["frobnicate"]).status, 1);
});
