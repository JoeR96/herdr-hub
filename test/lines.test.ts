import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTokens, TOKEN_NAMES, BLANK, ICON, sidebarWidth, DEFAULT_WIDTH } from "../src/model/lines.ts";
import type { SpaceView } from "../src/model/lines.ts";
import { cellWidth } from "../src/model/format.ts";

const now = Date.parse("2026-10-10T12:00:00Z");
const clean = { branch: "main", upstream: "origin/main", ahead: 2, behind: 0, dirty: false };
const base: SpaceView = { kind: "main", git: clean, agents: [], pr: null, release: null, ghProblem: null, stale: false, now, indent: "blank", evidence: null, width: 200 };
const strip = (t: Record<string, string | null>) =>
  Object.fromEntries(Object.entries(t).filter(([, v]) => v !== null).map(([k, v]) => [k, v!.replaceAll(BLANK, "")]));

test("every token is reported, absent ones as null so herdr clears them", () => {
  const t = buildTokens({ ...base, git: null });
  assert.deepEqual(Object.keys(t).sort(), [...TOKEN_NAMES].sort());
  assert.ok(Object.values(t).every((v) => v === null));
});

test("main space: branch, git state and release each get their own parts", () => {
  const t = buildTokens({ ...base, git: { ...clean, behind: 3, dirty: true },
    release: { source: "workflow", name: "Release Widgets", state: "success", atMs: now - 2 * 86_400_000, url: null } });
  assert.deepEqual(strip(t), {
    hub_branch: `${ICON.branch} main`,
    hub_git: "● changes", hub_ahead: "↑2", hub_behind: "↓3",
    hub_release: `${ICON.release} Release Widgets`, hub_release_state: "✔", hub_release_age: "2d ago",
  });
  assert.ok(t.hub_branch!.startsWith(BLANK.repeat(4)));
});

test("worktree space: agent, branch, git, PR with checks, evidence", () => {
  const t = buildTokens({ ...base, kind: "worktree", git: { ...clean, branch: "feature/stairs", ahead: 0 },
    agents: [{ kind: "claude", title: "stairs fix", state: "working" }, { kind: "claude", title: "other", state: "idle" }],
    pr: { number: 7, title: "t", url: "u", isDraft: true, headRefName: "feature/stairs", checks: "failure" },
    evidence: { url: "https://claude.ai/artifact/a", unpublished: 3 } });
  assert.deepEqual(strip(t), {
    hub_agent: `${ICON.agent} stairs fix +1`,
    hub_branch: `${ICON.branch} feature/stairs`,
    hub_git: "✔ clean",
    hub_pr: `${ICON.pr} #7 draft`, hub_checks: "✘ checks failed",
    hub_evidence: `${ICON.evidence} evidence`, hub_evidence_state: "3 to publish",
  });
  assert.ok(t.hub_agent!.startsWith(BLANK.repeat(6)));
});

test("check, release and evidence states read as words", () => {
  const wt = { ...base, kind: "worktree" as const };
  const pr = (checks: "success" | "pending" | "none") => buildTokens({ ...wt, pr: { number: 1, title: "", url: "", isDraft: false, headRefName: "", checks } }).hub_checks;
  assert.deepEqual([pr("success"), pr("pending"), pr("none")], ["✔ checks passed", `${ICON.running} checks running`, "no checks"]);
  assert.equal(buildTokens({ ...wt, stale: true, pr: { number: 1, title: "", url: "", isDraft: false, headRefName: "", checks: "success" } }).hub_checks, "✔ checks passed · stale");
  assert.equal(buildTokens({ ...wt, evidence: { url: "u", unpublished: 0 } }).hub_evidence_state, "✔ up to date");
  assert.equal(buildTokens({ ...wt, evidence: null }).hub_evidence, null);
  const rel = buildTokens({ ...base, stale: true, release: { source: "deployment", name: "Production", state: "pending", atMs: now - 60_000, url: null } });
  assert.deepEqual([rel.hub_release_state, rel.hub_release_age], [ICON.running, "1m ago · stale"]);
  assert.equal(buildTokens({ ...base, ghProblem: "gh not signed in" }).hub_problem?.replaceAll(BLANK, ""), "gh not signed in");
});

test("long names wrap onto a second line at / or - instead of being cut", () => {
  const t = buildTokens({ ...base, kind: "worktree", width: 52,
    git: { ...clean, branch: "feature/arena-experience-overhaul-with-extra-words", ahead: 0 },
    agents: [{ kind: "claude", title: "bdb-arena-experience-overhaul and some more", state: "working" }] });
  const room = 52 - 13;
  for (const k of ["hub_agent", "hub_agent2", "hub_branch", "hub_branch2"]) {
    assert.ok(t[k], `${k} is set`);
    assert.ok(cellWidth(t[k]!) <= room, `${k} "${t[k]}" is ${cellWidth(t[k]!)} cells`);
  }
  assert.equal((t.hub_branch! + t.hub_branch2!).replaceAll(BLANK, "").replace(`${ICON.branch} `, ""), "feature/arena-experience-overhaul-with-extra-words");
  assert.ok(/[/-]$/.test(t.hub_branch!), "breaks after a / or -");
  assert.ok(t.hub_branch2!.startsWith(BLANK.repeat(8)), "continuation is indented under the name");
  assert.equal(t.hub_agent2!.includes("…"), false);
});

test("wide characters wrap by cells too", () => {
  const t = buildTokens({ ...base, kind: "worktree", width: 52, git: { ...clean, branch: "feature/日本語のブランチ名前テスト機能追加とさらに長い", ahead: 0 } });
  for (const k of ["hub_branch", "hub_branch2"]) assert.ok(cellWidth(t[k]!) <= 39, `${k} is ${cellWidth(t[k]!)} cells`);
});

test("bar indent style uses a visible bar instead of blanks", () => {
  assert.equal(buildTokens({ ...base, indent: "bar" }).hub_branch, `│ ${ICON.branch} main`);
});

test("sidebarWidth prefers a dragged width from session.json, then config.toml", () => {
  const toml = "[ui]\nsidebar_width = 52\nsidebar_max_width = 72\n";
  assert.equal(sidebarWidth(toml, null), 52);
  assert.equal(sidebarWidth(toml, '{"sidebar_width": null}'), 52);
  assert.equal(sidebarWidth(toml, '{"sidebar_width": 64}'), 64);
  assert.equal(sidebarWidth(toml, "not json"), 52);
  assert.equal(sidebarWidth("[ui]\npane_gaps = true\n", null), DEFAULT_WIDTH);
});

test("the release name leaves room for its state and age on the same row", () => {
  const t = buildTokens({ ...base, width: 40, release: { source: "workflow", name: "Release Big Dave's Bonanza nightly build", state: "success", atMs: now - 4 * 86_400_000, url: null } });
  const row = [t.hub_release, t.hub_release_state, t.hub_release_age].join(" · ");
  assert.ok(cellWidth(row) <= 40 - 9, `"${row}" is ${cellWidth(row)} cells`);
  assert.ok(t.hub_release2);
});
