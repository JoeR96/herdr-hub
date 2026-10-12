import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { statePaths, acquirePidLock, lockHeld, releasePidLock, readPidLock, withFileLock, log, lastLogLines, readCache, writeCache } from "../src/state.ts";

const fresh = () => statePaths(mkdtempSync(join(tmpdir(), "hub-state-")));

test("a pid lock held by a live process blocks; a dead one is taken over", () => {
  const p = fresh();
  const dead = spawnSync(process.execPath, ["-e", ""]).pid!;
  writeFileSync(p.daemonLock, String(dead));
  assert.equal(acquirePidLock(p.daemonLock), true);
  assert.equal(readPidLock(p.daemonLock), process.pid);
  // our own pid counts as ours, a live foreign pid blocks
  assert.equal(acquirePidLock(p.daemonLock), true);
  writeFileSync(p.daemonLock, String(process.ppid));
  assert.equal(acquirePidLock(p.daemonLock), false);
  writeFileSync(p.daemonLock, String(process.pid));
  releasePidLock(p.daemonLock);
  assert.equal(existsSync(p.daemonLock), false);
});

test("a lock whose heartbeat has gone quiet is taken over even if its pid now belongs to someone else", () => {
  const p = fresh();
  writeFileSync(p.daemonLock, String(process.ppid)); // a live process that isn't the daemon (pid reused after a reboot)
  const old = (Date.now() - 10 * 60_000) / 1000;
  utimesSync(p.daemonLock, old, old);
  assert.equal(lockHeld(p.daemonLock, 5 * 60_000), false);
  assert.equal(acquirePidLock(p.daemonLock, 5 * 60_000), true);
  assert.equal(lockHeld(p.daemonLock, 5 * 60_000), true);
});

test("only one of several processes racing for the daemon lock wins", async () => {
  const p = fresh();
  const stateUrl = new URL("../src/state.ts", import.meta.url).href;
  const startAt = Date.now() + 1500; // every process spins until the same instant, then grabs
  const script = `import { acquirePidLock } from ${JSON.stringify(stateUrl)};
    while (Date.now() < ${startAt}) {}
    const won = acquirePidLock(${JSON.stringify(p.daemonLock)});
    process.stdout.write(won ? "won" : "lost");
    setTimeout(() => {}, 1500);`;
  const runs = Array.from({ length: 6 }, () => new Promise<string>((res) => {
    const c = spawn(process.execPath, ["--input-type=module", "-e", script]);
    let out = "";
    c.stdout.on("data", (d) => { out += d; });
    c.on("exit", () => res(out));
  }));
  const results = await Promise.all(runs);
  assert.equal(results.filter((r) => r === "won").length, 1, results.join(","));
});

test("withFileLock runs callers one at a time", async () => {
  const p = fresh();
  let inside = 0, maxInside = 0;
  const job = () => withFileLock(p.pinnedLock, async () => {
    inside++; maxInside = Math.max(maxInside, inside);
    await new Promise((r) => setTimeout(r, 30));
    inside--;
  });
  await Promise.all([job(), job(), job()]);
  assert.equal(maxInside, 1);
  assert.equal(existsSync(p.pinnedLock), false);
});

test("withFileLock breaks a stale lock", async () => {
  const p = fresh();
  writeFileSync(p.pinnedLock, "");
  const old = (Date.now() - 120_000) / 1000;
  utimesSync(p.pinnedLock, old, old);
  assert.equal(await withFileLock(p.pinnedLock, async () => 42), 42);
});

test("log appends lines and rotates past 1 MB", () => {
  const p = fresh();
  writeFileSync(p.log, "x".repeat(1024 * 1024 + 10));
  log(p, "hello");
  assert.ok(existsSync(p.log + ".1"));
  assert.match(lastLogLines(p, 1)[0], /hello$/);
});

test("cache round-trips and survives a corrupt file", () => {
  const p = fresh();
  assert.deepEqual(readCache(p), { repos: {} });
  writeCache(p, { repos: { "a/b": { data: null, fetchedAt: 1, error: "x" } } });
  assert.equal(readCache(p).repos["a/b"].error, "x");
  writeFileSync(p.cache, "{ broken");
  assert.deepEqual(readCache(p), { repos: {} });
});
