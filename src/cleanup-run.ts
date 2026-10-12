import { existsSync, rmSync } from "node:fs";
import { basename } from "node:path";
import { deleteBranch, forgetMissingWorktree, removeWorktree } from "./io/git.ts";
import type { Row } from "./cleanup-gather.ts";

// On Windows a shell or agent that is still exiting keeps the folder locked for a moment. git has already
// checked the worktree is clean and unregistered it by the time it reports "failed to delete", so finishing
// the delete ourselves (with retries) only removes what git meant to remove.
async function finishDelete(path: string, attempts = 20, delayMs = 300): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    // rmSync's own retries don't cover EPERM on a folder another process is sitting in
    try { rmSync(path, { recursive: true, force: true }); } catch { /* still locked */ }
    if (!existsSync(path)) return true;
    await new Promise((res) => setTimeout(res, delayMs));
  }
  return false;
}

// The space is closed first: a shell or agent sitting in the folder stops git removing it.
export async function runCleanupActions(herdr: { closeWorkspace(id: string): Promise<void> }, rows: Row[], deleteBranches: Set<string>, settleMs = 1500): Promise<string[]> {
  const out: string[] = [];
  for (const r of rows) {
    const name = `${r.repoName} · ${basename(r.path)}`;
    try {
      if (r.workspaceId) {
        await herdr.closeWorkspace(r.workspaceId);
        await new Promise((res) => setTimeout(res, settleMs));
      }
      if (r.reason === "missing") {
        if (!forgetMissingWorktree(r.repoRoot, r.path)) { out.push(`✗ ${name}: couldn't find git's record of this worktree`); continue; }
        out.push(`✓ ${name}: forgotten (folder was already gone)`);
      } else {
        const rm = await removeWorktree(r.repoRoot, r.path);
        const message = (rm.stderr || rm.stdout).trim();
        if (rm.code !== 0 && !(/failed to delete/i.test(message) && await finishDelete(r.path))) {
          out.push(`✗ ${name}: ${message}`);
          continue;
        }
        out.push(`✓ ${name}: worktree removed`);
      }
      if (r.branch && deleteBranches.has(r.path)) {
        const b = await deleteBranch(r.repoRoot, r.branch);
        out.push(b.code === 0 ? `✓ ${name}: branch ${r.branch} deleted` : `✗ ${name}: kept branch ${r.branch} (${b.stderr.trim()})`);
      }
    } catch (e) {
      out.push(`✗ ${name}: ${(e as Error).message}`);
    }
  }
  return out;
}
