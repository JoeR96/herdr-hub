import { run } from "./exec.ts";

export interface Workspace {
  workspace_id: string;
  label: string;
  focused?: boolean;
  tokens?: Record<string, string>;
  worktree?: { repo_root?: string; checkout_path?: string; is_linked_worktree?: boolean; repo_name?: string } | null;
}
export interface Pane { pane_id: string; workspace_id: string; tab_id: string; cwd: string; agent?: string; agent_status?: string }
export interface Agent { name?: string; agent: string; agent_status: string; pane_id: string; workspace_id: string; terminal_title_stripped?: string }
export interface Snapshot { workspaces: Workspace[]; panes: Pane[]; agents: Agent[]; focused_workspace_id?: string }

export class HerdrError extends Error {}

export class Herdr {
  bin: string;
  prefix: string[];

  constructor(bin?: string, prefix: string[] = []) {
    this.bin = bin ?? process.env.HERDR_BIN_PATH ?? "herdr";
    this.prefix = prefix;
  }

  async call(args: string[]): Promise<any> {
    const r = await run(this.bin, [...this.prefix, ...args], { timeoutMs: 20_000 });
    const text = r.stdout.trim();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
    if (json?.error) throw new HerdrError(json.error.message ?? JSON.stringify(json.error));
    if (r.code !== 0) throw new HerdrError(`herdr ${args.slice(0, 2).join(" ")} failed: ${(r.stderr || r.stdout).trim()}`);
    return json?.result ?? null;
  }

  async snapshot(): Promise<Snapshot> {
    const s = (await this.call(["api", "snapshot"]))?.snapshot ?? {};
    return { ...s, workspaces: s.workspaces ?? [], panes: s.panes ?? [], agents: s.agents ?? [] };
  }

  async createWorkspace(cwd: string, label: string): Promise<string | null> {
    const r = await this.call(["workspace", "create", "--cwd", cwd, "--label", label, "--no-focus"]);
    return r?.workspace?.workspace_id ?? null;
  }

  async closeWorkspace(id: string): Promise<void> {
    await this.call(["workspace", "close", id]);
  }

  async reportTokens(workspaceId: string, tokens: Record<string, string | null>, ttlMs: number): Promise<void> {
    const args = ["workspace", "report-metadata", workspaceId, "--source", "herdr-hub", "--ttl-ms", String(ttlMs)];
    for (const [k, v] of Object.entries(tokens)) {
      if (v === null) args.push("--clear-token", k); else args.push("--token", `${k}=${v}`);
    }
    await this.call(args);
  }

  async createWorktree(o: { repo: string; branch: string; base: string; label: string }): Promise<{ workspaceId: string; paneId: string }> {
    const r = await this.call(["worktree", "create", "--cwd", o.repo, "--branch", o.branch, "--base", o.base, "--label", o.label, "--focus"]);
    return { workspaceId: r.workspace.workspace_id, paneId: r.root_pane.pane_id };
  }

  async createTab(workspaceId: string, label: string): Promise<string> {
    const r = await this.call(["tab", "create", "--workspace", workspaceId, "--label", label, "--focus"]);
    return r.root_pane.pane_id;
  }

  // A brand-new worktree can show Claude's first-run screen; herdr then reports agent_not_ready, which clears itself.
  async startAgent(name: string, paneId: string, agentArgs: string[]): Promise<{ ok: boolean; message: string }> {
    const r = await run(this.bin, [...this.prefix, "agent", "start", name, "--kind", "claude", "--pane", paneId, "--timeout", "120000", "--", ...agentArgs], { timeoutMs: 150_000 });
    const out = `${r.stdout}${r.stderr}`.trim();
    return { ok: r.code === 0 || out.includes("agent_not_ready"), message: out };
  }

  async openPane(entrypoint: string): Promise<void> {
    await this.call(["plugin", "pane", "open", "--plugin", "herdr-hub", "--entrypoint", entrypoint]);
  }

  async notify(title: string, body: string): Promise<void> {
    try { await this.call(["notification", "show", title, "--body", body]); } catch { /* best effort */ }
  }

  async version(): Promise<string | null> {
    const r = await run(this.bin, [...this.prefix, "--version"]);
    return /(\d+\.\d+\.\d+)/.exec(r.stdout)?.[1] ?? null;
  }
}
