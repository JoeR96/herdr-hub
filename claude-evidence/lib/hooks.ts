import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { gitInfo } from "./git.ts";
import { readPublished, readStore, unpublishedCount } from "./store.ts";

export const TOOL_HINT = `node "${homedir().replace(/\\/g, "/")}/.claude/evidence/evidence.ts"`;

export function sessionStartOutput(cwd: string): object | null {
  const info = gitInfo(cwd);
  if (!info?.linked) return null;
  return {
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: `This session is in git worktree ${info.top} (branch ${info.branch}). When you verify your work - screenshots, recordings, test runs, before/after - save the proof as you go with the evidence skill (\`${TOOL_HINT} add\`). It is published as one evidence page for this worktree.`,
    },
  };
}

export function stopOutput(input: { cwd?: unknown; stop_hook_active?: unknown }): object | null {
  if (input.stop_hook_active === true || typeof input.cwd !== "string") return null;
  const info = gitInfo(input.cwd);
  if (!info?.linked) return null;
  let count: number;
  try {
    const store = readStore(info.top);
    if (!store) return null;
    count = unpublishedCount(store, readPublished(info.top));
  } catch {
    return null;
  }
  if (!count) return null;
  return {
    decision: "block",
    reason: `This worktree has ${count} unpublished evidence item(s). Publish them with the evidence skill (evidence build, Artifact publish, evidence published <url>), then finish. If publishing fails, tell the user and stop.`,
  };
}

/** Shared entry for the hook scripts: read stdin JSON, print the output, never fail. */
export function runHook(decide: (input: Record<string, unknown>) => object | null): void {
  try {
    const raw = readFileSync(0, "utf8");
    const input = JSON.parse(raw);
    if (!input || typeof input !== "object") return;
    const out = decide(input);
    if (out) process.stdout.write(JSON.stringify(out));
  } catch {
    // fail open: a broken evidence tool must never get in Claude's way
  }
}
