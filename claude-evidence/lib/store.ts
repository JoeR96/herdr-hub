import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";

export const KINDS = ["screenshot", "gif", "video", "test-output", "log", "diff", "note"] as const;
export type Kind = (typeof KINDS)[number];
export interface Item { id: number; round: number; kind: Kind; file: string | null; caption: string; addedAt: string }
export interface Store { version: 1; round: number; items: Item[] }
export interface Published { url: string; publishedAt: string; publishedRound: number }
export type Source = { path: string } | { text: string } | null;

export const MAX_TEXT = 200 * 1024;
export const MAX_FILE = 15 * 1024 * 1024;

export const evidenceDir = (top: string) => join(top, ".evidence");
const storeFile = (top: string) => join(evidenceDir(top), "evidence.json");
const publishedFile = (top: string) => join(evidenceDir(top), "artifact.json");

/** null when there is no evidence yet; throws when evidence.json exists but can't be parsed. */
export function readStore(top: string): Store | null {
  const file = storeFile(top);
  if (!existsSync(file)) return null;
  try {
    const s = JSON.parse(readFileSync(file, "utf8")) as Store;
    if (typeof s.round !== "number" || !Array.isArray(s.items)) throw new Error("bad shape");
    return s;
  } catch {
    throw new Error(`corrupt evidence.json at ${file} - fix or delete it`);
  }
}

export function readPublished(top: string): Published | null {
  try {
    const p = JSON.parse(readFileSync(publishedFile(top), "utf8")) as Published;
    return typeof p.url === "string" && typeof p.publishedRound === "number" ? p : null;
  } catch {
    return null;
  }
}

export function unpublishedCount(store: Store, pub: Published | null): number {
  const after = pub?.publishedRound ?? 0;
  return store.items.filter((i) => i.round > after).length;
}

export function guessKind(file: string): Kind {
  const ext = extname(file).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".webp"].includes(ext)) return "screenshot";
  if (ext === ".gif") return "gif";
  if ([".mp4", ".webm"].includes(ext)) return "video";
  if ([".diff", ".patch"].includes(ext)) return "diff";
  return "log";
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "item";
}

function excludeOnce(commonDir: string): void {
  const file = join(commonDir, "info", "exclude");
  const text = existsSync(file) ? readFileSync(file, "utf8") : "";
  if (text.split(/\r?\n/).includes(".evidence/")) return;
  mkdirSync(join(commonDir, "info"), { recursive: true });
  appendFileSync(file, `${text && !text.endsWith("\n") ? "\n" : ""}.evidence/\n`);
}

function truncate(text: string): string {
  const buf = Buffer.from(text, "utf8");
  if (buf.length <= MAX_TEXT) return text;
  return `[truncated: showing the last 200 KB]\n${buf.subarray(buf.length - MAX_TEXT).toString("utf8")}`;
}

export function addItem(top: string, commonDir: string, opts: { kind: Kind; caption: string; source: Source; now: Date }): Item {
  const store: Store = readStore(top) ?? { version: 1, round: 1, items: [] };
  if (opts.source && "path" in opts.source && statSync(opts.source.path).size > MAX_FILE) {
    throw new Error(`${opts.source.path} is over 15 MB, the Artifact file limit - trim or compress it first`);
  }
  mkdirSync(join(evidenceDir(top), "files"), { recursive: true });
  excludeOnce(commonDir);

  const id = store.items.reduce((m, i) => Math.max(m, i.id), 0) + 1;
  let file: string | null = null;
  if (opts.source) {
    const ext = "path" in opts.source ? extname(opts.source.path).toLowerCase() || ".txt" : ".txt";
    file = `files/${id}-${slug(opts.caption)}${ext}`;
    const dest = join(evidenceDir(top), file);
    if ("path" in opts.source) copyFileSync(opts.source.path, dest);
    else writeFileSync(dest, truncate(opts.source.text));
  }
  const item: Item = { id, round: store.round, kind: opts.kind, file, caption: opts.caption, addedAt: opts.now.toISOString() };
  store.items.push(item);
  writeFileSync(storeFile(top), JSON.stringify(store, null, 2));
  return item;
}

export function markPublished(top: string, url: string, now: Date): Published {
  const store = readStore(top) ?? { version: 1 as const, round: 1, items: [] };
  const pub: Published = { url, publishedAt: now.toISOString(), publishedRound: store.round };
  mkdirSync(evidenceDir(top), { recursive: true });
  writeFileSync(publishedFile(top), JSON.stringify(pub, null, 2));
  writeFileSync(storeFile(top), JSON.stringify({ ...store, round: store.round + 1 }, null, 2));
  return pub;
}
