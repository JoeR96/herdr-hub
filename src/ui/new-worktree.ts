import { showMessage } from "./term.ts";
export async function runNewWorktree(_workspaceId?: string): Promise<void> { await showMessage("New worktree", ["Not built yet."]); }
