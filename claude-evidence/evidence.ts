#!/usr/bin/env node
// Evidence for the current git worktree: save proof, build the page, record the published Artifact.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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
  evidence capture-screen --caption "<text>"   (Windows: whole screen)
  evidence build [--out <folder>]   writes the page, prints { page, files, url }
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

/** --out puts the page and media under another folder, for sessions whose working directory isn't the worktree root. */
function build(out: string | undefined): void {
  const info = repoInfo();
  const store = readStore(info.top) ?? fail("no evidence saved in this worktree yet");
  const dir = evidenceDir(info.top);
  const html = renderPage(
    { repo: repoName(info), branch: info.branch, worktree: info.top, commit: headSummary(info.top), updatedAt: new Date().toISOString() },
    store,
    (file) => { try { return readFileSync(join(dir, file), "utf8"); } catch { return "(file missing)"; } },
  );
  const siteDir = out ? resolve(out) : join(dir, "site");
  mkdirSync(siteDir, { recursive: true });
  const page = join(siteDir, "index.html");
  writeFileSync(page, html);
  const files: Record<string, string> = {};
  for (const i of store.items) {
    if (!i.file || !["screenshot", "gif", "video"].includes(i.kind)) continue;
    files[i.file] = join(dir, i.file);
    if (out) {
      mkdirSync(join(siteDir, "files"), { recursive: true });
      copyFileSync(files[i.file], join(siteDir, i.file));
      files[i.file] = join(siteDir, i.file);
    }
  }
  process.stdout.write(JSON.stringify({ page, files, url: readPublished(info.top)?.url ?? null }, null, 2) + "\n");
}

const CAPTURE_PS = `Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$b = [System.Windows.Forms.SystemInformation]::VirtualScreen
$img = New-Object System.Drawing.Bitmap $b.Width, $b.Height
[System.Drawing.Graphics]::FromImage($img).CopyFromScreen($b.Left, $b.Top, 0, 0, $img.Size)
$img.Save($env:EVIDENCE_SHOT, [System.Drawing.Imaging.ImageFormat]::Png)`;

function captureScreen(caption: string | undefined): void {
  if (process.platform !== "win32") fail("capture-screen only works on Windows - save a screenshot file and use add");
  const info = repoInfo();
  const shot = join(tmpdir(), `evidence-${process.pid}-${Date.now()}.png`);
  try {
    execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", CAPTURE_PS], { env: { ...process.env, EVIDENCE_SHOT: shot }, stdio: ["ignore", "ignore", "pipe"], timeout: 30_000 });
    const item = addItem(info.top, info.commonDir, { kind: "screenshot", caption: caption ?? "Screen", source: { path: shot }, now: new Date() });
    process.stdout.write(`saved #${item.id} (${item.kind}) in round ${item.round}\n`);
  } finally {
    rmSync(shot, { force: true });
  }
}

function main(): void {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { kind: { type: "string" }, caption: { type: "string" }, out: { type: "string" } },
  });
  const [cmd, ...rest] = positionals;
  switch (cmd) {
    case "add": return add(rest, values);
    case "build": return build(values.out);
    case "capture-screen": return captureScreen(values.caption);
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
