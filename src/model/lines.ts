import type { GitStatus } from "./git-parse.ts";
import type { PullRequest } from "./github-map.ts";
import type { Release } from "./release.ts";
import { symbol } from "./checks.ts";
import { age } from "./format.ts";

// herdr trims ordinary leading whitespace from token values; U+2800 survives and renders blank.
export const BLANK = "⠀";
export const TOKEN_NAMES = ["hub1", "hub2", "hub3", "hub4"] as const;
// herdr cuts token values at the sidebar edge without wrapping, so lines are fitted to this many cells.
export const DEFAULT_WIDTH = 36;
const BORDER = 4;

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
  /** cells available for a whole line, indent included */
  width: number;
}

/** A line whose `flex` part (a name) is shortened first, so the status marks in `head`/`tail` stay visible. */
interface Line { head: string; flex: string; tail: string }

/** Text width of herdr's sidebar from its config.toml ([ui] sidebar_width), less the border and padding. */
export function sidebarWidth(toml: string | null): number {
  const m = toml?.match(/^\s*sidebar_width\s*=\s*(\d+)/m);
  return m ? Math.max(12, Number(m[1]) - BORDER) : DEFAULT_WIDTH;
}

const cells = (s: string) => [...s].length;
const cut = (s: string, n: number) => (n <= 0 ? "" : cells(s) <= n ? s : [...s].slice(0, Math.max(0, n - 1)).join("") + "…");

function fit(l: Line, width: number): string {
  const whole = l.head + l.flex + l.tail;
  if (cells(whole) <= width) return whole;
  const room = width - cells(l.head) - cells(l.tail);
  if (l.flex && room >= 2) return l.head + cut(l.flex, room) + l.tail;
  return cut(whole, width);
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
  const room = v.width - cells(pad);
  return raw.filter((l): l is Line => !!l).slice(0, TOKEN_NAMES.length).map((l) => pad + fit(l, room));
}

export function toTokens(lines: string[]): Record<string, string | null> {
  const tokens: Record<string, string | null> = {};
  TOKEN_NAMES.forEach((name, i) => { tokens[name] = lines[i] ?? null; });
  return tokens;
}
