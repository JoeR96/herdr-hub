# Evidence Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Claude saves proof of its work per worktree, publishes it as one living Artifact page, and herdr-hub shows and opens that page.

**Architecture:** A dependency-free Node CLI (`claude-evidence/`) owns the `.evidence/` folder format and renders the page. Two Claude hooks nudge Claude (SessionStart reminder, Stop block on unpublished items) and an installer puts the tool, skill and hooks into `~/.claude`. herdr-hub reads the same format through the shared `store.ts` to add a menu item and a sidebar suffix.

**Tech Stack:** Node 24 (native TypeScript type stripping), `node:test`, git CLI, herdr-hub plugin.

**Spec:** `docs/superpowers/specs/2026-10-12-evidence-pages-design.md`

## Global Constraints

- Node >= 24, no npm dependencies, `.ts` files run directly with `node`, ESM, relative imports with `.ts` extension.
- Text evidence over 200 KB keeps the last 200 KB; any copied file over 15 MB is refused.
- Hooks always fail open: any error → exit 0, no output.
- Stop hook never blocks when `stop_hook_active` is true.
- `.evidence/` is written to `$(git-common-dir)/info/exclude` once.
- Page: `<title>Evidence · <branch></title>`, colour tokens on `:root`, dark mode via `prefers-color-scheme` guarded by `:root:not([data-theme="light"])` and `:root[data-theme="dark"]`, explicit `body` background, no external scripts, works at 360px wide.
- Two PRs into `feature/v1`: PR A = Tasks 1-4 (branch `feature/evidence-tool`), PR B = Tasks 5-6 (branch `feature/evidence-hub`, cut after PR A merges).

## Review Focus

- Paths with spaces or backslashes (Windows worktrees like `D:\herdr-worktrees\x`): every path goes through `path.join`/`execFile` args, never a shell string. Test: store tests use a temp dir with a space in its name.
- Hook run from a subfolder of the worktree, not its root: must still find `.evidence/` at the top level. Test in Task 3.
- Hook input that is empty or not JSON: exits 0 silently. Test in Task 3.
- `settings.json` that already has other SessionStart/Stop hooks (herdr's): the installer adds alongside and is idempotent on re-run. Test in Task 4.
- Caption/log text containing `<script>` or `&`: escaped in the page. Test in Task 2.

---

## PR A — evidence tool (`feature/evidence-tool`)

### Task 1: Store and git helpers

**Files:**
- Create: `claude-evidence/lib/git.ts`, `claude-evidence/lib/store.ts`
- Test: `test/evidence/store.test.ts`

**Interfaces (Produces):**
- `gitInfo(cwd: string): GitInfo | null` — `GitInfo = { top: string; gitDir: string; commonDir: string; branch: string; linked: boolean }`. One `git rev-parse --path-format=absolute --show-toplevel --git-dir --git-common-dir --abbrev-ref HEAD` call via `execFileSync`, 5 s timeout. `linked` = normalised gitDir ≠ normalised commonDir.
- `headSummary(top: string): string` — `git log -1 --format=%h %s`, "" on failure.
- `KINDS`, `type Kind`, `interface Item { id; round; kind; file: string | null; caption: string; addedAt: string }`, `interface Store { version: 1; round: number; items: Item[] }`, `interface Published { url; publishedAt; publishedRound }`.
- `evidenceDir(top)`, `readStore(top): Store | null` (null if missing, throws `Error("corrupt evidence.json …")` if unparseable), `readPublished(top): Published | null` (null if missing/invalid), `unpublishedCount(store, pub): number`.
- `guessKind(file): Kind`, `addItem(top, commonDir, { kind, caption, source: { path } | { text } | null, now }): Item`, `markPublished(top, url, now): Published`.
- Constants `MAX_TEXT = 200 * 1024`, `MAX_FILE = 15 * 1024 * 1024`.

- [ ] Step 1: tests — temp repo (dir name with a space) + linked worktree: `gitInfo` returns `linked` false/true; `addItem` with a file copies it to `files/1-<slug>.<ext>` and creates `evidence.json` with round 1; second call gets id 2; exclude file contains `.evidence/` exactly once after two adds; text over `MAX_TEXT` is truncated with a `[truncated` header; file over `MAX_FILE` throws; `markPublished` sets `publishedRound` 1, bumps round to 2, and `unpublishedCount` goes 2 → 0 → 1 after another add; corrupt `evidence.json` makes `readStore` throw and `addItem` throw without rewriting it; `guessKind` table.
- [ ] Step 2: run `node --test test/evidence/store.test.ts` → FAIL (module missing).
- [ ] Step 3: implement both modules.
- [ ] Step 4: run → PASS. Run full `npm test` → PASS.
- [ ] Step 5: commit `Add the evidence store and git helpers`.

### Task 2: Page renderer and CLI

**Files:**
- Create: `claude-evidence/lib/render.ts`, `claude-evidence/evidence.ts`
- Test: `test/evidence/render.test.ts`, `test/evidence/cli.test.ts`

**Interfaces:**
- Consumes Task 1.
- Produces `renderPage(ctx: { repo; branch; worktree; commit; updatedAt }, store: Store, readText: (file: string) => string): string` and the CLI commands `add <file|-> [--kind k] [--caption c]` (note: no source, `--kind note` required), `build` (prints `{ page, files, url }`), `published <url>`, `status` (prints `{ worktree, unpublished, url }`). Errors: message to stderr, exit 1.

- [ ] Step 1: render tests — rounds newest first; empty rounds skipped; screenshot → `<img src="files/…">`, video → `<video controls`, test-output → `<details open>`, log → `<details>` without `open`, diff lines starting `+`/`-` get classes; caption `<script>&` is escaped; title is `Evidence · feature/x`; contains `prefers-color-scheme: dark` and `:root[data-theme="dark"]`.
- [ ] Step 2: CLI tests — spawn `node claude-evidence/evidence.ts` in a temp worktree subfolder: add file, pipe stdin, add note, `build` JSON lists only binary files in `files` and `page` exists, `published https://claude.ai/artifact/x` then `status` shows 0 unpublished and the url; `add` outside a git repo exits 1.
- [ ] Step 3: run → FAIL. Step 4: implement. Step 5: run → PASS, full suite PASS.
- [ ] Step 6: commit `Add the evidence page renderer and CLI`.

### Task 3: Hooks

**Files:**
- Create: `claude-evidence/lib/hooks.ts` (pure decisions), `claude-evidence/hooks/session-start.ts`, `claude-evidence/hooks/stop.ts`
- Test: `test/evidence/hooks.test.ts`

**Interfaces:**
- `sessionStartOutput(cwd: string): object | null`, `stopOutput(input: { cwd?: string; stop_hook_active?: boolean }): object | null`. Hook entry files read all stdin, `JSON.parse`, call these, print JSON if non-null; whole body wrapped in try/catch → exit 0.

- [ ] Step 1: tests — main checkout → both null; worktree no evidence → session-start returns context mentioning the branch, stop null; worktree with one unpublished item → stop returns `decision: "block"` and reason containing `1 unpublished`; `stop_hook_active: true` → null; after `markPublished` → null; cwd = subfolder of worktree behaves the same; spawning `hooks/stop.ts` with stdin `garbage` and with empty stdin exits 0 with empty stdout.
- [ ] Step 2: run → FAIL. Step 3: implement. Step 4: run → PASS.
- [ ] Step 5: commit `Add the evidence SessionStart and Stop hooks`.

### Task 4: Skill and installer, then install for real

**Files:**
- Create: `claude-evidence/SKILL.md`, `claude-evidence/install.ts`, `claude-evidence/README.md`
- Test: `test/evidence/install.test.ts`

**Interfaces:**
- `install(opts: { home: string; source: string; node: string }): { settingsChanged: boolean; backup: string | null }`. Copies `evidence.ts`, `lib/`, `hooks/` into `<home>/.claude/evidence/` with a `package.json` `{"type":"module"}`, writes `<home>/.claude/skills/evidence/SKILL.md` with `{{EVIDENCE}}` replaced by the forward-slash path of the installed `evidence.ts`, and adds one `SessionStart` and one `Stop` command hook (`"<node>" "<home>/.claude/evidence/hooks/<x>.ts"`) to `<home>/.claude/settings.json` unless a hook command containing `/.claude/evidence/hooks/` already exists for that event. Backs up settings to `settings.json.bak-evidence-<timestamp>` before writing. Refuses (throws) if settings.json is not valid JSON.

- [ ] Step 1: tests — fresh home: files copied, skill has the real path, settings has both hooks; settings with an existing herdr SessionStart hook keeps it and adds ours; second run changes nothing (`settingsChanged` false, no new backup); invalid JSON throws and file is untouched.
- [ ] Step 2: run → FAIL. Step 3: write SKILL.md (per spec §3) and install.ts with a CLI entry (`node claude-evidence/install.ts`). Step 4: run → PASS, full suite PASS.
- [ ] Step 5: commit `Add the evidence skill and installer`.
- [ ] Step 6: push, open PR A into `feature/v1`, merge it (`gh pr merge --merge --delete-branch`).
- [ ] Step 7: `git -C C:/dev/herdr-hub pull`, run `node C:/dev/herdr-hub/claude-evidence/install.ts`, check `~/.claude/settings.json` shows both hooks next to herdr's.

## PR B — herdr-hub integration (`feature/evidence-hub`, from updated `feature/v1`)

### Task 5: Sidebar marker

**Files:**
- Create: `src/io/evidence.ts`
- Modify: `src/model/lines.ts` (`SpaceView.evidence`, `branchLine`), `src/daemon.ts:79-84`, `tsconfig.json` include `claude-evidence`
- Test: `test/evidence-io.test.ts`, `test/lines.test.ts`

**Interfaces:**
- `readEvidence(folder: string): { url: string | null; unpublished: number } | null` — uses `readStore`/`readPublished`; null on no store or any throw.
- `SpaceView.evidence: { url: string | null; unpublished: number } | null`. Worktree branch line gets ` · evidence` if `url` and 0 unpublished, ` · evidence +N` if N > 0, nothing if null. Main spaces never show it.

- [ ] Step 1: tests — `readEvidence` on a folder with no `.evidence` → null, with store + published → url and 0, corrupt → null; `buildLines` worktree suffixes for the three cases; existing `base` objects gain `evidence: null`.
- [ ] Step 2: FAIL. Step 3: implement, wire daemon (`evidence: k.kind === "worktree" ? readEvidence(k.folder) : null`). Step 4: PASS.
- [ ] Step 5: commit `Show evidence status on worktree sidebar rows`.

### Task 6: Menu item, README, ship

**Files:**
- Modify: `src/ui/menu-items.ts` (`MenuInfo.evidenceUrl`), `src/ui/menu.ts`, `README.md`, `test/menu-items.test.ts`

- [ ] Step 1: tests — worktree with `evidenceUrl` → ids `["new-worktree", "open-pr", "open-evidence", "open-repo", …]`, label `Open evidence page`; without → absent.
- [ ] Step 2: FAIL. Step 3: implement (menu.ts sets `evidenceUrl` from `readEvidence(kind.folder)` for worktrees, only if `isWebUrl`; handler `openUrl`). README section. Step 4: PASS, full suite PASS.
- [ ] Step 5: commit `Add an Open evidence page menu item`.
- [ ] Step 6: publish evidence for this branch with the installed tool (test output + sidebar capture), push, open PR B into `feature/v1` with the evidence link, merge.
- [ ] Step 7: `git -C C:/dev/herdr-hub pull`, `herdr plugin link C:/dev/herdr-hub`, refresh the hub daemon, confirm the evidence worktree row shows `· evidence`.
