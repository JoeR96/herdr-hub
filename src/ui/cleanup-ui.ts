import { basename } from "node:path";
import { Herdr } from "../io/herdr.ts";
import { configDir, loadConfig } from "../config.ts";
import { statePaths, touchTrigger } from "../state.ts";
import { gatherRows } from "../cleanup-gather.ts";
import type { Row } from "../cleanup-gather.ts";
import { runCleanupActions } from "../cleanup-run.ts";
import { warnings } from "../model/cleanup.ts";
import { visibleItems } from "./tty.ts";
import type { Item, ListState } from "./tty.ts";
import { pickFromList, printScreen, showMessage } from "./term.ts";

const TITLE = "Clean up workstreams";

function describe(r: Row, deleteBranch: boolean): string {
  const steps = [r.workspaceId ? "close space" : null, r.reason === "missing" ? "prune" : "remove worktree", deleteBranch ? `delete branch ${r.branch}` : null].filter(Boolean);
  return `• ${r.repoName} · ${basename(r.path)}: ${steps.join(", ")}${r.agentCount ? " (stops its agent)" : ""}`;
}

export async function runCleanupUi(): Promise<void> {
  const herdr = new Herdr();
  const { config } = loadConfig(configDir());
  printScreen(TITLE, ["Looking for finished workstreams…"]);
  let rows: Row[];
  try { rows = await gatherRows(herdr, config); } catch (e) {
    await showMessage(TITLE, [`Couldn't list worktrees: ${(e as Error).message}`]);
    return;
  }
  if (!rows.length) { await showMessage(TITLE, ["Nothing to clean up: no merged, stale or missing worktrees."]); return; }

  const deleteBranches = new Set<string>();
  const items: Item[] = rows.map((r) => ({
    id: r.path,
    label: `${r.repoName} · ${basename(r.path)}${r.branch ? ` (${r.branch})` : ""}`,
    note: [r.detail, ...warnings(r)].join(" · "),
    disabled: !r.selectable,
  }));
  const toggleBranch = (st: ListState, ch: string): ListState => {
    if (ch !== "b") return st;
    const it = visibleItems(st)[st.cursor];
    const row = rows.find((r) => r.path === it?.id);
    if (!it || it.disabled || !row?.branch) return st;
    if (deleteBranches.has(it.id)) deleteBranches.delete(it.id); else deleteBranches.add(it.id);
    const checked = new Set(st.checked).add(it.id);
    return { ...st, checked, items: st.items.map((x) => x.id === it.id ? { ...x, hint: deleteBranches.has(it.id) ? "+ delete branch" : undefined } : x) };
  };

  const picked = await pickFromList(items, { title: `${TITLE} · ${rows.length} found`, footer: "↑↓ move · space tick · b also delete branch · enter continue · esc cancel", mode: "multi", onChar: toggleBranch });
  if (picked.kind !== "done" || !picked.ids.length) return;
  const chosen = rows.filter((r) => picked.ids.includes(r.path));

  const confirm = await pickFromList(
    [{ id: "go", label: `Clean up ${chosen.length} workstream${chosen.length === 1 ? "" : "s"}` }, { id: "cancel", label: "Cancel" }],
    { title: "Confirm", intro: chosen.map((r) => describe(r, deleteBranches.has(r.path))).concat([""]), footer: "enter choose · esc cancel", mode: "single" });
  if (confirm.kind !== "select" || confirm.id !== "go") return;

  printScreen(TITLE, ["Working…"]);
  const results = await runCleanupActions(herdr, chosen, deleteBranches);
  touchTrigger(statePaths());
  await showMessage("Done", results);
}
