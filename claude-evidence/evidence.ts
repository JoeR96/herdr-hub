#!/usr/bin/env node
// Evidence for the current git worktree: save proof, build the page, record the published Artifact.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { gitInfo, headSummary } from "./lib/git.ts";
import type { GitInfo } from "./lib/git.ts";
import { renderPage } from "./lib/render.ts";
import { addItem, evidenceDir, guessKind, KINDS, markPublished, readPublished, readStore, unpublishedCount } from "./lib/store.ts";
import type { Kind, Source } from "./lib/store.ts";

const USAGE = `usage:
  evidence add <file|-> [--kind <kind>] --caption "<text>"   (- reads stdin)
  evidence add --kind note --caption "<text>"
  evidence build        writes the page, prints { page, files, url }
  evidence published <url>
  evidence status
kinds: ${KINDS.join(", ")}`;

function fail(msg: string): never {
  process.stderr.write(`evidence: ${msg}\n`);
  process.exit(1);
}

function repoInfo(): GitInfo {
  return gitInfo(process.cwd()) ?? fail("not inside a git repository");
}

const repoName = (info: GitInfo) => basename(dirname(info.commonDir));

function add(positionals: string[], values: { kind?: string; caption?: string }): void {
  const info = repoInfo();
  const target = positionals[0];
  if (values.kind && !(KINDS as readonly string[]).includes(values.kind)) fail(`unknown kind "${values.kind}"\n${USAGE}`);
  let kind = values.kind as Kind | undefined;
  let source: Source = null;
  if (target === "-") source = { text: readFileSync(0, "utf8") };
  else if (target) {
    const path = resolve(process.cwd(), target);
    if (!existsSync(path)) fail(`file not found: ${path}`);
    source = { path };
  } else if (kind !== "note") fail(`give a file, - for stdin, or --kind note\n${USAGE}`);
  kind ??= guessKind(target ?? "");
  const item = addItem(info.top, info.commonDir, { kind, caption: values.caption ?? basename(target ?? "note"), source, now: new Date() });
  process.stdout.write(`saved #${item.id} (${item.kind}) in round ${item.round}\n`);
}

function build(): void {
  const info = repoInfo();
  const store = readStore(info.top) ?? fail("no evidence saved in this worktree yet");
  const dir = evidenceDir(info.top);
  const html = renderPage(
    { repo: repoName(info), branch: info.branch, worktree: info.top, commit: headSummary(info.top), updatedAt: new Date().toISOString() },
    store,
    (file) => { try { return readFileSync(join(dir, file), "utf8"); } catch { return "(file missing)"; } },
  );
  mkdirSync(join(dir, "site"), { recursive: true });
  const page = join(dir, "site", "index.html");
  writeFileSync(page, html);
  const files: Record<string, string> = {};
  for (const i of store.items) {
    if (i.file && ["screenshot", "gif", "video"].includes(i.kind)) files[i.file] = join(dir, i.file);
  }
  process.stdout.write(JSON.stringify({ page, files, url: readPublished(info.top)?.url ?? null }, null, 2) + "\n");
}

function main(): void {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { kind: { type: "string" }, caption: { type: "string" } },
  });
  const [cmd, ...rest] = positionals;
  switch (cmd) {
    case "add": return add(rest, values);
    case "build": return build();
    case "published": {
      const url = rest[0];
      if (!url || !/^https:\/\//.test(url)) fail("published needs the https URL the Artifact tool returned");
      const p = markPublished(repoInfo().top, url, new Date());
      process.stdout.write(`recorded ${p.url} (round ${p.publishedRound})\n`);
      return;
    }
    case "status": {
      const info = repoInfo();
      const store = readStore(info.top);
      const pub = readPublished(info.top);
      process.stdout.write(JSON.stringify({ worktree: info.top, unpublished: store ? unpublishedCount(store, pub) : 0, url: pub?.url ?? null }) + "\n");
      return;
    }
    default: fail(USAGE);
  }
}

try { main(); } catch (e) { fail((e as Error).message); }
