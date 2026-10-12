import type { GitStatus } from "./git-parse.ts";
import type { PullRequest } from "./github-map.ts";
import type { Release } from "./release.ts";
import { symbol } from "./checks.ts";
import { age, cellWidth, cutCells } from "./format.ts";

// herdr trims ordinary leading whitespace from token values; U+2800 survives and renders blank.
export const BLANK = "⠀";
export const TOKEN_NAMES = ["hub1", "hub2", "hub3", "hub4"] as const;
// herdr cuts token values at the sidebar edge without wrapping, so lines are fitted to the sidebar.
// Measured on herdr 0.9.1: a space row shows sidebar_width - 8 cells, a worktree row nested under its
// repo 4 fewer. One more cell is kept spare.
export const DEFAULT_WIDTH = 40;
const INSET = { main: 9, worktree: 13 } as const;

export type IndentStyle = "blank" | "bar";
export interface AgentInfo { kind: string; title: string; state: string }
export interface EvidenceInfo { url: string | null; unpublished: number }
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
  /** herdr's sidebar width in cells (see sidebarWidth) */
  width: number;
}

/** A line whose `flex` part (a name) is shortened first, so the status marks in `head`/`tail` stay visible. */
interface Line { head: string; flex: string; tail: string }

/** herdr's sidebar width: a width dragged by hand (session.json) wins over [ui] sidebar_width in config.toml. */
export function sidebarWidth(toml: string | null, session: string | null): number {
  try {
    const dragged = JSON.parse(session ?? "null")?.sidebar_width;
    if (typeof dragged === "number" && dragged > 0) return dragged;
  } catch { /* fall back to config.toml */ }
  const m = toml?.match(/^\s*sidebar_width\s*=\s*(\d+)/m);
  return m ? Number(m[1]) : DEFAULT_WIDTH;
}


function fit(l: Line, width: number): string {
  const whole = l.head + l.flex + l.tail;
  if (cellWidth(whole) <= width) return whole;
  const room = width - cellWidth(l.head) - cellWidth(l.tail);
  if (l.flex && room >= 2) return l.head + cutCells(l.flex, room) + l.tail;
  return cutCells(whole, width);
}

function indentFor(kind: SpaceView["kind"], style: IndentStyle): string {
  return style === "bar" ? "│ " : BLANK.repeat(kind === "main" ? 4 : 6);
}

function branchLine(g: GitStatus | null): Line | null {
  if (!g) return null;
  let tail = ` ${g.dirty ? "●" : "✓"}`;
  if (g.ahead) tail += ` ⇡${g.ahead}`;
  if (g.behind) tail += ` ⇣${g.behind}`;
  return { head: "", flex: g.branch ?? "detached", tail };
}

function evidenceLine(e: EvidenceInfo | null): Line | null {
  if (!e || (!e.url && !e.unpublished)) return null;
  return { head: e.unpublished ? `evidence +${e.unpublished} to publish` : "evidence ✓", flex: "", tail: "" };
}

function releaseLine(r: Release, now: number, stale: boolean): Line {
  const sym = symbol(r.state);
  return { head: "⇡ ", flex: r.name, tail: ["", ...(sym ? [sym] : []), age(r.atMs, now), ...(stale ? ["stale"] : [])].join(" · ") };
}

function prLine(p: PullRequest, stale: boolean): Line {
  return { head: [`PR #${p.number}`, p.isDraft ? "draft" : "open", `checks ${symbol(p.checks) || "none"}`, ...(stale ? ["stale"] : [])].join(" · "), flex: "", tail: "" };
}

function agentLine(agents: AgentInfo[]): Line | null {
  if (!agents.length) return null;
  const a = agents[0];
  return { head: `${a.kind} · `, flex: a.title, tail: ` · ${a.state}${agents.length > 1 ? ` +${agents.length - 1}` : ""}` };
}

const plain = (s: string | null): Line | null => (s ? { head: s, flex: "", tail: "" } : null);

export function buildLines(v: SpaceView): string[] {
  const raw = v.kind === "main"
    ? [branchLine(v.git), v.release ? releaseLine(v.release, v.now, v.stale) : null, plain(v.ghProblem)]
    : [agentLine(v.agents), branchLine(v.git), v.pr ? prLine(v.pr, v.stale) : null, evidenceLine(v.evidence)];
  const pad = indentFor(v.kind, v.indent);
  const room = v.width - INSET[v.kind] - cellWidth(pad);
  return raw.filter((l): l is Line => !!l).slice(0, TOKEN_NAMES.length).map((l) => pad + fit(l, room));
}

export function toTokens(lines: string[]): Record<string, string | null> {
  const tokens: Record<string, string | null> = {};
  TOKEN_NAMES.forEach((name, i) => { tokens[name] = lines[i] ?? null; });
  return tokens;
}
