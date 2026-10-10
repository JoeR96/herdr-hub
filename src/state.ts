import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RepoData } from "./model/github-map.ts";

export interface StatePaths { dir: string; log: string; daemonLock: string; pinnedLock: string; trigger: string; cache: string }

export function statePaths(dir: string = process.env.HERDR_PLUGIN_STATE_DIR ?? join(tmpdir(), "herdr-hub")): StatePaths {
  mkdirSync(dir, { recursive: true });
  return {
    dir,
    log: join(dir, "herdr-hub.log"),
    daemonLock: join(dir, "daemon.pid"),
    pinnedLock: join(dir, "pinned.lock"),
    trigger: join(dir, "refresh"),
    cache: join(dir, "cache.json"),
  };
}

const MAX_LOG = 1024 * 1024;

export function log(p: StatePaths, msg: string): void {
  try {
    if (existsSync(p.log) && statSync(p.log).size > MAX_LOG) renameSync(p.log, p.log + ".1");
    appendFileSync(p.log, `${new Date().toISOString()} ${msg}\n`);
  } catch { /* logging must never break the plugin */ }
}

export function lastLogLines(p: StatePaths, n: number): string[] {
  try { return readFileSync(p.log, "utf8").trimEnd().split("\n").slice(-n); } catch { return []; }
}

export function pidAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch (e) { return (e as { code?: string }).code === "EPERM"; }
}

export function readPidLock(file: string): number | null {
  try {
    const n = Number(readFileSync(file, "utf8").trim());
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch { return null; }
}

// The daemon rewrites its lock every tick. A lock that has gone quiet is dead even if its pid is alive:
// after a reboot or a killed process, Windows soon hands the same pid to something else.
export const LOCK_MAX_AGE = 5 * 60_000;

export function lockHeld(file: string, maxAgeMs = LOCK_MAX_AGE): boolean {
  const pid = readPidLock(file);
  if (!pid || !pidAlive(pid)) return false;
  try { return Date.now() - statSync(file).mtimeMs < maxAgeMs; } catch { return false; }
}

// Creating the file is the claim (exclusive create), so two daemons starting together can't both win.
// A dead or silent lock is moved aside with a rename, which only one of several racers can do.
export function acquirePidLock(file: string, maxAgeMs = LOCK_MAX_AGE): boolean {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const fd = openSync(file, "wx");
      writeSync(fd, String(process.pid));
      closeSync(fd);
      return true;
    } catch (e) {
      if ((e as { code?: string }).code !== "EEXIST") throw e;
    }
    const pid = readPidLock(file);
    if (pid === process.pid) { heartbeat(file); return true; }
    if (lockHeld(file, maxAgeMs)) return false;
    // another process has just created the file and not written its pid yet
    try { if (pid === null && Date.now() - statSync(file).mtimeMs < 2000) return false; } catch { continue; }
    try { renameSync(file, `${file}.${process.pid}.stale`); unlinkSync(`${file}.${process.pid}.stale`); } catch { /* someone else moved it */ }
  }
  return false;
}

// The daemon calls this every tick; an old timestamp is how others know it died.
export function heartbeat(file: string): void {
  if (readPidLock(file) === process.pid) writeFileSync(file, String(process.pid));
}

export function releasePidLock(file: string): void {
  if (readPidLock(file) === process.pid) { try { unlinkSync(file); } catch { /* already gone */ } }
}

// Cross-process mutex: whoever creates the file first owns it. Locks older than staleMs are broken.
export async function withFileLock<T>(file: string, fn: () => Promise<T>, timeoutMs = 30_000, staleMs = 60_000): Promise<T> {
  const start = Date.now();
  for (;;) {
    try { closeSync(openSync(file, "wx")); break; } catch (e) {
      if ((e as { code?: string }).code !== "EEXIST") throw e;
      try {
        if (Date.now() - statSync(file).mtimeMs > staleMs) { unlinkSync(file); continue; }
      } catch { continue; }
      if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${file}`);
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  try { return await fn(); } finally { try { unlinkSync(file); } catch { /* already gone */ } }
}

export function touchTrigger(p: StatePaths): void {
  writeFileSync(p.trigger, String(Date.now()));
}

export interface CacheEntry { data: RepoData | null; fetchedAt: number; error: string | null }
export interface Cache { repos: Record<string, CacheEntry> }

export function readCache(p: StatePaths): Cache {
  try {
    const c = JSON.parse(readFileSync(p.cache, "utf8"));
    return c && typeof c.repos === "object" && c.repos !== null ? c : { repos: {} };
  } catch { return { repos: {} }; }
}

export function writeCache(p: StatePaths, c: Cache): void {
  const tmp = p.cache + ".tmp";
  writeFileSync(tmp, JSON.stringify(c));
  try { renameSync(tmp, p.cache); } catch { writeFileSync(p.cache, JSON.stringify(c)); }
}
