import { existsSync } from "node:fs";
import { Herdr } from "../io/herdr.ts";
import { githubRepo, status } from "../io/git.ts";
import { openTarget } from "../io/open.ts";
import { configDir, configFile, loadConfig, saveConfig, togglePin } from "../config.ts";
import { lastLogLines, readCache, statePaths, touchTrigger } from "../state.ts";
import { ensureDaemon } from "../daemon-control.ts";
import { spaceKind } from "../locate.ts";
import { menuItems } from "./menu-items.ts";
import type { MenuInfo } from "./menu-items.ts";
import { pickFromList, readContext, showMessage } from "./term.ts";
import { runNewWorktree } from "./new-worktree.ts";
import { runCleanupUi } from "./cleanup-ui.ts";
import { runDoctor } from "./doctor.ts";

const herdr = new Herdr();
const paths = statePaths();
const ctx = readContext();
const snap = await herdr.snapshot();
const ws = snap.workspaces.find((w) => w.workspace_id === ctx.workspace_id) ?? snap.workspaces.find((w) => w.focused);
if (!ws) { await showMessage("herdr hub", ["Couldn't tell which space is focused."]); process.exit(0); }

const kind = await spaceKind(ws, snap);
const { config } = loadConfig(configDir());
const info: MenuInfo = { kind: kind.kind, prNumber: null, prUrl: null, releaseUrl: null, repoUrl: null, pinned: config.pinned.some((p) => p.label === ws.label) };
if (kind.kind !== "other") {
  const repo = await githubRepo(kind.repoRoot);
  if (repo) {
    info.repoUrl = `https://github.com/${repo.owner}/${repo.name}`;
    const data = readCache(paths).repos[`${repo.owner}/${repo.name}`]?.data;
    if (kind.kind === "main") info.releaseUrl = data?.release?.url ?? null;
    const branch = (await status(kind.folder))?.branch;
    const pr = kind.kind === "worktree" && branch ? data?.prs.find((p) => p.headRefName === branch) : undefined;
    if (pr) { info.prNumber = pr.number; info.prUrl = pr.url; }
  }
}

const choice = await pickFromList(menuItems(info), { title: `herdr hub · ${ws.label}`, footer: "↑↓ move · enter run · type to filter · esc close", mode: "single" });
if (choice.kind !== "select") process.exit(0);

switch (choice.id) {
  case "new-worktree": await runNewWorktree(ws.workspace_id); break;
  case "open-pr": await openTarget(info.prUrl!); break;
  case "open-release": await openTarget(info.releaseUrl!); break;
  case "open-repo": await openTarget(info.repoUrl!); break;
  case "cleanup": await runCleanupUi(); break;
  case "refresh": {
    touchTrigger(paths);
    ensureDaemon(paths);
    const errors = lastLogLines(paths, 20).filter((l) => /failed|error|unreachable|skipped/i.test(l)).slice(-3);
    await showMessage("Refreshing", ["The sidebar updates within a few seconds.", ...(errors.length ? ["", "Recent problems:", ...errors] : [])]);
    break;
  }
  case "pin": {
    const path = kind.kind === "other" ? (snap.panes.find((p) => p.workspace_id === ws.workspace_id)?.cwd ?? ctx.workspace_cwd ?? "") : kind.repoRoot;
    const r = togglePin(config, ws.label, path.replace(/\\/g, "/"));
    saveConfig(configDir(), r.config);
    await showMessage(r.pinned ? "Pinned" : "Unpinned", [r.pinned ? `"${ws.label}" will always stay open.` : `"${ws.label}" can be closed for good now.`]);
    break;
  }
  case "open-config": {
    const file = configFile(configDir());
    if (!existsSync(file)) saveConfig(configDir(), config);
    if (!(await openTarget(file))) await showMessage("Config file", [file]);
    break;
  }
  case "doctor": await runDoctor(); break;
}
