import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repoWithWorktree } from "./helpers.ts";
import { gitInfo } from "../../claude-evidence/lib/git.ts";
import { addItem, guessKind, markPublished, MAX_FILE, MAX_TEXT, readPublished, readStore, unpublishedCount } from "../../claude-evidence/lib/store.ts";

const now = new Date("2026-10-12T14:00:00Z");

test("gitInfo tells a main checkout from a linked worktree", () => {
  const { root, repo, wt } = repoWithWorktree();
  assert.equal(gitInfo(repo)?.linked, false);
  const info = gitInfo(wt)!;
  assert.equal(info.linked, true);
  assert.equal(info.branch, "feature/x");
  assert.equal(info.top.toLowerCase().replace(/\\/g, "/"), wt.toLowerCase().replace(/\\/g, "/"));
  assert.equal(gitInfo(root), null);
});

test("addItem copies files, numbers items and excludes .evidence once", () => {
  const { wt } = repoWithWorktree();
  const info = gitInfo(wt)!;
  const png = join(wt, "shot.png");
  writeFileSync(png, "fakepng");
  const a = addItem(info.top, info.commonDir, { kind: "screenshot", caption: "Login Page!", source: { path: png }, now });
  assert.deepEqual([a.id, a.round, a.file], [1, 1, "files/1-login-page.png"]);
  assert.equal(readFileSync(join(info.top, ".evidence", a.file!), "utf8"), "fakepng");
  const b = addItem(info.top, info.commonDir, { kind: "note", caption: "done", source: null, now });
  assert.deepEqual([b.id, b.file], [2, null]);
  assert.equal(readStore(info.top)!.items.length, 2);
  const exclude = readFileSync(join(info.commonDir, "info", "exclude"), "utf8");
  assert.equal(exclude.split(/\r?\n/).filter((l) => l === ".evidence/").length, 1);
});

test("long text keeps the tail and big files are refused", () => {
  const { wt } = repoWithWorktree();
  const info = gitInfo(wt)!;
  const text = "x".repeat(MAX_TEXT) + "END";
  const item = addItem(info.top, info.commonDir, { kind: "log", caption: "big log", source: { text }, now });
  const saved = readFileSync(join(info.top, ".evidence", item.file!), "utf8");
  assert.ok(saved.startsWith("[truncated"));
  assert.ok(saved.endsWith("END"));
  const big = join(wt, "big.mp4");
  writeFileSync(big, Buffer.alloc(MAX_FILE + 1));
  assert.throws(() => addItem(info.top, info.commonDir, { kind: "video", caption: "v", source: { path: big }, now }), /15 MB/);
});

test("publishing closes the round and unpublished counts restart", () => {
  const { wt } = repoWithWorktree();
  const info = gitInfo(wt)!;
  const add = () => addItem(info.top, info.commonDir, { kind: "note", caption: "n", source: null, now });
  add(); add();
  assert.equal(unpublishedCount(readStore(info.top)!, readPublished(info.top)), 2);
  const pub = markPublished(info.top, "https://claude.ai/artifact/abc", now);
  assert.equal(pub.publishedRound, 1);
  assert.equal(readStore(info.top)!.round, 2);
  assert.equal(unpublishedCount(readStore(info.top)!, readPublished(info.top)), 0);
  assert.equal(add().round, 2);
  assert.equal(unpublishedCount(readStore(info.top)!, readPublished(info.top)), 1);
});

test("a corrupt evidence.json is reported and never overwritten", () => {
  const { wt } = repoWithWorktree();
  const info = gitInfo(wt)!;
  addItem(info.top, info.commonDir, { kind: "note", caption: "n", source: null, now });
  const file = join(info.top, ".evidence", "evidence.json");
  writeFileSync(file, "{oops");
  assert.throws(() => readStore(info.top), /corrupt/);
  assert.throws(() => addItem(info.top, info.commonDir, { kind: "note", caption: "n", source: null, now }), /corrupt/);
  assert.equal(readFileSync(file, "utf8"), "{oops");
});

test("readPublished and readStore return null when nothing exists", () => {
  const { wt } = repoWithWorktree();
  assert.equal(readStore(wt), null);
  assert.equal(readPublished(wt), null);
  assert.equal(existsSync(join(wt, ".evidence")), false);
});

test("guessKind maps extensions", () => {
  assert.deepEqual(
    ["a.PNG", "b.jpg", "c.webp", "d.gif", "e.mp4", "f.webm", "g.diff", "h.patch", "i.txt", "-"].map(guessKind),
    ["screenshot", "screenshot", "screenshot", "gif", "video", "video", "diff", "diff", "log", "log"],
  );
});

test("text files added by path are truncated and binary files can't pose as text", () => {
  const { wt } = repoWithWorktree();
  const info = gitInfo(wt)!;
  const log = join(wt, "big.log");
  writeFileSync(log, "y".repeat(MAX_TEXT * 2) + "TAIL");
  const item = addItem(info.top, info.commonDir, { kind: "log", caption: "big", source: { path: log }, now });
  const saved = readFileSync(join(info.top, ".evidence", item.file!), "utf8");
  assert.ok(saved.startsWith("[truncated") && saved.endsWith("TAIL"));
  const bin = join(wt, "clip.mov");
  writeFileSync(bin, Buffer.from([0, 1, 2, 0, 255]));
  assert.throws(() => addItem(info.top, info.commonDir, { kind: guessKind(bin), caption: "mov", source: { path: bin }, now }), /not a text file/);
});
