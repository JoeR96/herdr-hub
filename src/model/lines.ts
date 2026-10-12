import type { GitStatus } from "./git-parse.ts";
import type { PullRequest } from "./github-map.ts";
import type { Release } from "./release.ts";
import { symbol } from "./checks.ts";
import { age } from "./format.ts";
import type { EvidenceInfo } from "../io/evidence.ts";

// herdr trims ordinary leading whitespace from token values; U+2800 survives and renders blank.
export const BLANK = "⠀";
export const TOKEN_NAMES = ["hub1", "hub2", "hub3", "hub4"] as const;

export type IndentStyle = "blank" | "bar";
export interface AgentInfo { kind: string; title: string; state: string }
export interface SpaceView {
  kind: "main" | "worktree";
  git: GitStatus | null;
  agents: AgentInfo[];
  pr: PullRequest | null;
  release: Release | null;
  ghProblem: string | null;
  stale: boolean;
  now: number;
  indent: IndentStyle;
  evidence: EvidenceInfo | null;
}

function indentFor(kind: SpaceView["kind"], style: IndentStyle): string {
  return style === "bar" ? "│ " : BLANK.repeat(kind === "main" ? 4 : 6);
}

function branchLine(g: GitStatus | null, evidence: EvidenceInfo | null = null): string | null {
  if (!g) return null;
  let s = `${g.branch ?? "detached"} ${g.dirty ? "●" : "✓"}`;
  if (g.ahead) s += ` ⇡${g.ahead}`;
  if (g.behind) s += ` ⇣${g.behind}`;
  if (evidence && (evidence.url || evidence.unpublished)) s += ` · evidence${evidence.unpublished ? ` +${evidence.unpublished}` : ""}`;
  return s;
}

function releaseLine(r: Release, now: number, stale: boolean): string {
  const sym = symbol(r.state);
  return [`⇡ ${r.name}`, ...(sym ? [sym] : []), age(r.atMs, now), ...(stale ? ["stale"] : [])].join(" · ");
}

function prLine(p: PullRequest, stale: boolean): string {
  return [`PR #${p.number}`, p.isDraft ? "draft" : "open", `checks ${symbol(p.checks) || "none"}`, ...(stale ? ["stale"] : [])].join(" · ");
}

function agentLine(agents: AgentInfo[]): string | null {
  if (!agents.length) return null;
  const a = agents[0];
  return `${a.kind} · ${a.title} · ${a.state}${agents.length > 1 ? ` +${agents.length - 1}` : ""}`;
}

export function buildLines(v: SpaceView): string[] {
  const raw = v.kind === "main"
    ? [branchLine(v.git), v.release ? releaseLine(v.release, v.now, v.stale) : null, v.ghProblem]
    : [agentLine(v.agents), branchLine(v.git, v.evidence), v.pr ? prLine(v.pr, v.stale) : null];
  const pad = indentFor(v.kind, v.indent);
  return raw.filter((l): l is string => !!l).slice(0, TOKEN_NAMES.length).map((l) => pad + l);
}

export function toTokens(lines: string[]): Record<string, string | null> {
  const tokens: Record<string, string | null> = {};
  TOKEN_NAMES.forEach((name, i) => { tokens[name] = lines[i] ?? null; });
  return tokens;
}
