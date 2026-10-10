import { spawn } from "node:child_process";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";
import { Herdr } from "../io/herdr.ts";
import { baseRef, fetchOrigin } from "../io/git.ts";
import { configDir, loadConfig } from "../config.ts";
import { log, statePaths } from "../state.ts";
import { spaceKind } from "../locate.ts";
import { classify } from "../model/classify.ts";
import { planWorktree } from "../model/naming.ts";
import { isEntry } from "../entry.ts";
import { pickFromList, printScreen, promptText, readContext, showMessage } from "./term.ts";

interface Job { repo: string; branch: string; label: string; agentName: string }

export async function runNewWorktree(workspaceId?: string): Promise<void> {
  const herdr = new Herdr();
  const snap = await herdr.snapshot();
  const ws = snap.workspaces.find((w) => w.workspace_id === workspaceId) ?? snap.workspaces.find((w) => w.focused);
  if (!ws) { await showMessage("New worktree", ["Couldn't tell which space is focused."]); return; }
  const kind = await spaceKind(ws, snap);

  if (kind.kind === "other") {
    const r = await pickFromList([{ id: "tab", label: "Start Claude in a new tab here" }, { id: "no", label: "Cancel" }],
      { title: `${ws.label} isn't a git repo`, intro: ["A worktree needs a git repo. You can still start Claude in a new tab."], footer: "enter choose · esc cancel", mode: "single" });
    if (r.kind !== "select" || r.id !== "tab") return;
    const paneId = await herdr.createTab(ws.workspace_id, "claude");
    await herdr.startAgent(`claude-${Date.now().toString(36)}`, paneId, []);
    return;
  }

  // name worktrees after the repo's main space, e.g. "big daves bonanza" -> bdb-...
  const main = snap.workspaces.find((w) => {
    const k = classify(w, []);
    return k.kind === "main" && k.repoKey === kind.repoKey;
  });
  const spaceLabel = kind.kind === "main" ? ws.label : main?.label ?? basename(kind.repoRoot);
  const { config } = loadConfig(configDir());

  for (;;) {
    const typed = await promptText(`New Claude worktree in ${spaceLabel}`, "Type a short name (e.g. 'stairs fix'), or 'fix/stairs' to pick the branch.");
    if (typed === null) return;
    const plan = planWorktree(typed, config.newWorktree.branchPrefix, spaceLabel);
    if (!plan) continue;
    if (snap.agents.some((a) => a.name === plan.agentName)) {
      await showMessage("Name taken", [`An agent called ${plan.agentName} already exists. Pick another name.`]);
      continue;
    }
    const job: Job = { repo: kind.repoRoot, ...plan };
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "--worker", JSON.stringify(job)],
      { detached: true, stdio: "ignore", windowsHide: true, env: process.env });
    child.unref();
    printScreen("New worktree", [`Creating ${plan.branch}…`, "It appears in the sidebar when ready."]);
    await new Promise((r) => setTimeout(r, 1200));
    return;
  }
}

// Runs detached so herdr isn't blocked while a big repo checks out.
async function worker(job: Job): Promise<void> {
  const herdr = new Herdr();
  const paths = statePaths();
  try {
    await fetchOrigin(job.repo);
    const base = await baseRef(job.repo);
    log(paths, `new worktree ${job.branch} from ${base} in ${job.repo}`);
    const { paneId } = await herdr.createWorktree({ repo: job.repo, branch: job.branch, base, label: job.label });
    const started = await herdr.startAgent(job.agentName, paneId, ["-n", job.agentName]);
    if (!started.ok) throw new Error(`claude didn't start: ${started.message}`);
  } catch (e) {
    const msg = (e as Error).message;
    log(paths, `new worktree ${job.branch} failed: ${msg}`);
    await herdr.notify("New worktree failed", msg.slice(0, 200));
  }
}

if (isEntry(import.meta.url)) {
  if (process.argv[2] === "--worker") await worker(JSON.parse(process.argv[3]));
  else await runNewWorktree(readContext().workspace_id);
}
