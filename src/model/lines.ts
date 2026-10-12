import type { GitStatus } from "./git-parse.ts";
import type { PullRequest } from "./github-map.ts";
import type { Release } from "./release.ts";
import type { CheckState } from "./checks.ts";
import { age, cellWidth, cutCells, graphemes } from "./format.ts";

// herdr trims ordinary leading whitespace from token values; U+2800 survives and renders blank.
export const BLANK = "⠀";
// Nerd Font glyphs (the Font Awesome / Octicons / Devicons ranges; Material Design ones do not render).
// ok/fail are plain ✓ ✗: one cell wide and they take the row colour (the emoji ✔ does not).
export const ICON = { agent: "\uF120", branch: "\uE725", pr: "\uF407", release: "\uF135", evidence: "\uF030", running: "\uF017", ok: "\u2713", fail: "\u2717" } as const;

// Each part is its own token so herdr's config can colour it; rows with no value disappear.
// The [ui.sidebar.spaces] rows in the README place and colour them.
export const TOKEN_NAMES = [
  "hub_agent", "hub_agent2", "hub_branch", "hub_branch2", "hub_git", "hub_ahead", "hub_behind",
  "hub_pr", "hub_checks", "hub_checks2", "hub_release", "hub_release2", "hub_release_state", "hub_release_age",
  "hub_evidence", "hub_evidence_state", "hub_evidence_state2", "hub_problem",
] as const;
export type Tokens = Record<(typeof TOKEN_NAMES)[number], string | null>;

// herdr cuts token values at the sidebar edge without wrapping, so long names are wrapped here.
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

/** herdr's sidebar width: a width dragged by hand (session.json) wins over [ui] sidebar_width in config.toml. */
export function sidebarWidth(toml: string | null, session: string | null): number {
  try {
    const dragged = JSON.parse(session ?? "null")?.sidebar_width;
    if (typeof dragged === "number" && dragged > 0) return dragged;
  } catch { /* fall back to config.toml */ }
  const m = toml?.match(/^\s*sidebar_width\s*=\s*(\d+)/m);
  return m ? Number(m[1]) : DEFAULT_WIDTH;
}

function indentFor(kind: SpaceView["kind"], style: IndentStyle): string {
  return style === "bar" ? "│ " : BLANK.repeat(kind === "main" ? 4 : 6);
}

/**
 * `lead + name` in at most `room` cells, wrapping once onto a second line (indented by `cont`, `room2` wide).
 * Breaks after a / - _ or space when that keeps at least half the first line; only a name too long for
 * two lines is cut.
 */
function wrap(lead: string, name: string, room: number, cont: string, room2 = room): [string, string | null] {
  if (cellWidth(lead + name) <= room) return [lead + name, null];
  const parts = graphemes(name);
  const avail = room - cellWidth(lead);
  let used = 0, fits = 0, lastBreak = 0, usedAtBreak = 0;
  for (const p of parts) {
    if (used + p.cells > avail) break;
    used += p.cells;
    fits++;
    if ("/-_ ".includes(p.text)) { lastBreak = fits; usedAtBreak = used; }
  }
  const at = lastBreak && usedAtBreak * 2 >= avail ? lastBreak : Math.max(fits, 1);
  const first = parts.slice(0, at).map((p) => p.text).join("").trimEnd();
  const rest = parts.slice(at).map((p) => p.text).join("").trimStart();
  return [lead + first, cutCells(cont + rest, room2)];
}

/** herdr joins a row's tokens with " · "; when `first · second` won't fit, `second` gets its own line. */
function pair(first: string, second: string, room: number, cont: string): [string | null, string | null] {
  return cellWidth(`${first} · ${second}`) <= room ? [second, null] : [null, cutCells(cont + second, room)];
}

const CHECKS: Record<CheckState, string> = {
  success: `${ICON.ok} checks passed`, failure: `${ICON.fail} checks failed`, pending: `${ICON.running} checks running`, none: "no checks",
};
const STATE: Record<CheckState, string | null> = { success: ICON.ok, failure: ICON.fail, pending: ICON.running, none: null };

export function buildTokens(v: SpaceView): Tokens {
  const t = Object.fromEntries(TOKEN_NAMES.map((n) => [n, null])) as Tokens;
  if (!v.git) return t;
  const pad = indentFor(v.kind, v.indent);
  const cont = pad + BLANK.repeat(2);
  const room = v.width - INSET[v.kind];
  const stale = v.stale ? " · stale" : "";

  if (v.kind === "worktree" && v.agents.length) {
    const more = v.agents.length > 1 ? ` +${v.agents.length - 1}` : "";
    [t.hub_agent, t.hub_agent2] = wrap(`${pad}${ICON.agent} `, v.agents[0].title + more, room, cont);
  }
  [t.hub_branch, t.hub_branch2] = wrap(`${pad}${ICON.branch} `, v.git.branch ?? "detached", room, cont);
  t.hub_git = `${pad}${v.git.dirty ? "● changes" : `${ICON.ok} clean`}`;
  t.hub_ahead = v.git.ahead ? `↑${v.git.ahead}` : null;
  t.hub_behind = v.git.behind ? `↓${v.git.behind}` : null;

  if (v.kind === "worktree") {
    if (v.pr) {
      t.hub_pr = `${pad}${ICON.pr} #${v.pr.number} ${v.pr.isDraft ? "draft" : "open"}`;
      [t.hub_checks, t.hub_checks2] = pair(t.hub_pr, CHECKS[v.pr.checks] + stale, room, cont);
    }
    if (v.evidence && (v.evidence.url || v.evidence.unpublished)) {
      t.hub_evidence = `${pad}${ICON.evidence} evidence`;
      const state = v.evidence.unpublished ? `${v.evidence.unpublished} to publish` : `${ICON.ok} up to date`;
      [t.hub_evidence_state, t.hub_evidence_state2] = pair(t.hub_evidence, state, room, cont);
    }
  } else {
    if (v.release) {
      t.hub_release_state = STATE[v.release.state];
      t.hub_release_age = age(v.release.atMs, v.now) + stale;
      // state and age share the row (herdr joins tokens with " · "), so the name wraps before them
      const after = [t.hub_release_state, t.hub_release_age].filter(Boolean).map((s) => cellWidth(` · ${s}`)).reduce((a, b) => a + b, 0);
      [t.hub_release, t.hub_release2] = wrap(`${pad}${ICON.release} `, v.release.name, room - after, cont, room);
    }
    if (v.ghProblem) t.hub_problem = `${pad}${v.ghProblem}`;
  }
  return t;
}
