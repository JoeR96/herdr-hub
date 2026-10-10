# herdr-hub design

Date: 2026-10-10
Status: draft, awaiting review

## Purpose

A shareable herdr plugin that turns herdr into a development hub across several projects:

- Chosen project spaces stay open permanently, even with no worktrees.
- Each space row in the sidebar shows what's going on: the branch and latest release on a project's main space, and the agent, branch and pull request on each worktree space.
- One hotkey creates a worktree and starts Claude Code in it.
- One hotkey opens a menu of utilities: open links, clean up finished workstreams, refresh, and setup.

It must work the same on Windows, macOS and Linux, in any terminal (Windows Terminal, Ghostty and so on), and must need no per-user CI knowledge to share. Everything remote comes from GitHub through the `gh` CLI.

## Requirements

- herdr 0.9.0 or newer
- Node 24 or newer (runs the TypeScript sources directly, so there is no build step)
- `git`
- `gh`, signed in (`gh auth status`). Without it, only the local parts work.

No runtime npm dependencies. Dev-only: none beyond Node's built-in test runner.

## Non-goals (v1)

- Hosts other than GitHub (GitLab, Bitbucket).
- Vercel or other deploy hosts that are not connected to GitHub. Connected ones appear through GitHub deployments.
- Per-project custom links (Obsidian notes, dashboards).
- Agents other than Claude Code for "new worktree".
- A sidebar section of its own. herdr 0.9.1 has no plugin sidebar placement (upstream issue #4312, closed as not planned), so everything is written onto existing space rows.

## How it fits into herdr

herdr plugins are a folder with `herdr-plugin.toml`. The plugin uses four herdr features:

| herdr feature | Used for |
| --- | --- |
| `[[startup]]` hook | restore pinned spaces, start the background updater |
| `[[events]]` hooks | `workspace.closed` restores pinned spaces; `workspace.created` / `worktree.created` trigger an immediate sidebar refresh and restart the updater if it died |
| `[[actions]]` + `[[panes]]` (popup placement) | the menu and the new-worktree prompt |
| workspace metadata tokens (`herdr workspace report-metadata`) | the extra sidebar lines |

The plugin calls herdr only through `HERDR_BIN_PATH` (the CLI), so it works over Unix sockets and Windows named pipes alike.

## Configuration

One JSON file, `config.json`, in the plugin's config folder (`herdr plugin config-dir herdr-hub`). JSON keeps the plugin dependency-free. Missing keys fall back to the defaults shown.

```json
{
  "pinned": [
    { "label": "big daves bonanza", "path": "C:/Users/Administrator/TheExecutioner-Remake-Unity" },
    { "label": "enjoeneer.dev", "path": "C:/dev/enjoeneer.dev" }
  ],
  "refresh": { "localSeconds": 15, "githubSeconds": 180 },
  "cleanup": { "staleDays": 30 },
  "releaseWorkflowPattern": "release|deploy|publish",
  "newWorktree": { "branchPrefix": "feature/" }
}
```

The menu's setup area edits `pinned` (pin or unpin the current space) and opens the file for anything else.

### What the user adds to herdr's own config.toml

A plugin cannot edit `config.toml`, so the README gives this snippet. It replaces the built-in branch line with the plugin's four lines and binds the two hotkeys:

```toml
[ui.sidebar.spaces]
rows = [
  ["state_icon", "workspace", { token = "state_text", rules = [{ equals = "unknown", hide = true }] }],
  ["$hub1"], ["$hub2"], ["$hub3"], ["$hub4"],
]

[[keys.command]]
key = "ctrl+shift+m"
type = "plugin_action"
command = "herdr-hub.menu"

[[keys.command]]
key = "ctrl+shift+n"
type = "plugin_action"
command = "herdr-hub.new-worktree"
```

The README notes: Windows Terminal binds ctrl+shift+m (mark mode) and ctrl+shift+n (new window) by default, so unbind them there. Don't use ctrl+alt+letter on Windows, because it is AltGr on many keyboard layouts and never reaches herdr.

## Space types

Each space is classified from its panes' working folders:

- **Main space**: a pane is in a repo's main checkout (not a linked worktree).
- **Worktree space**: herdr reports it as a linked worktree, or `git rev-parse --git-common-dir` shows its folder is a linked worktree.
- **Other**: not in a git repo. The plugin writes nothing to it.

herdr only records repo info after a worktree command has touched a space, so the plugin always falls back to asking git.

## Sidebar lines

The plugin writes up to four tokens per space (`$hub1`..`$hub4`). An unset token hides its row. Lines are indented by the plugin itself: 4 spaces under a main space, and 6 under a worktree space so they sit under herdr's own worktree indent. If herdr strips leading spaces, the indent falls back to a leading `│ ` glyph. This is verified on a real herdr early in the build.

Main space:

```
    main ✓ ⇡2                                  branch · clean ✓ / dirty ● · ahead ⇡n / behind ⇣n
    ⇡ Release Big Dave's Bonanza · ✓ · 2d ago  latest release, see below
```

Worktree space:

```
      claude · hd-rework · idle                agent kind · name or terminal title · state (+n if more agents)
      worktree/poc-high-graphic-asset          branch
      PR #71 · draft · checks none             only when the branch has an open PR
```

States use symbols: ✓ success, ✗ failure, ⋯ running or pending.

Open PRs whose branch has no open space are not shown anywhere in the sidebar.

## Data sources

### Local, every `localSeconds`

- herdr: `workspace list`, `pane list`, `agent list` for spaces, panes, agents and their state.
- git, per space folder: branch, `status --porcelain` for clean or dirty, ahead and behind against the upstream.

### GitHub, every `githubSeconds` per repo

The GitHub repo is taken from the `origin` remote. Non-GitHub remotes get local lines only.

- **Pull requests**: one GraphQL query per repo through `gh api graphql`, covering open PRs with head branch, number, draft flag and `statusCheckRollup`. The rollup reduces to one state: any failure means ✗, else any pending means ⋯, else any success means ✓, else none.
- **Latest release**: the most recent of
  1. deployments, preferring environment `Production`, with state from the latest deployment status;
  2. published GitHub releases;
  3. workflow runs whose workflow name or file matches `releaseWorkflowPattern`.

  Displayed as `name · state · age`. This covers Vercel (it posts GitHub deployments), plain GitHub releases, and release workflows on GitHub-hosted or self-hosted runners alike.

GitHub results are cached in memory and in the state folder. A refresh that fails keeps the last values and marks them stale (dimmed, with a `stale` suffix).

## Background updater

- `startup.ts` (the startup hook) restores pinned spaces, then starts `daemon.ts` as a detached process and exits, because herdr startup hooks must be one-shot.
- A lock file in `HERDR_PLUGIN_STATE_DIR` holds the daemon's PID. A second daemon exits straight away if the PID in the lock is alive.
- Each local tick rewrites every space's tokens from current local data plus cached GitHub data, using `--ttl-ms` of twice the local interval, so lines vanish rather than go stale if the daemon dies.
- Event hooks touch a `refresh` file in the state folder. The daemon watches it (`fs.watch`) and refreshes straight away, including GitHub for the affected repo.
- The daemon exits after three consecutive failed herdr calls (herdr stopped).
- Errors are appended to `herdr-hub.log` in the state folder, capped at 1 MB with one rotation.

## Pinned spaces

On startup and on every `workspace.closed` event, every `pinned` entry whose label has no open space is recreated with `herdr workspace create --cwd <path> --label <label> --no-focus`. Entries whose folder doesn't exist are skipped and logged. Runs are serialised with a lock file so a burst of close events can't create duplicates.

Matching is by label, so renaming a pinned space creates a fresh one. The README says so.

## New worktree + Claude (ctrl+shift+n, also in the menu)

Opens a small popup in the current space:

1. If the space isn't in a git repo, it says so and offers a plain Claude tab in the space instead.
2. It asks for a name. `stairs fix` gives branch `<branchPrefix>stairs-fix`. Typing `fix/stairs` uses that as the branch.
3. It checks that the branch, folder and agent name are free, then starts a detached worker and closes the popup, so herdr isn't blocked while a large repo checks out.
4. The worker runs `git fetch origin` and picks the base (origin's default branch, falling back to `HEAD`). It then runs `herdr worktree create --cwd <repo> --branch <branch> --base <base> --label <typed name> --focus`. The folder comes from herdr's own `[worktrees] directory` setting. Then it runs `herdr agent start <name> --kind claude --pane <root pane> -- -n <name>`. A brand-new worktree can report `agent_not_ready` while Claude shows its first-run screen; that is treated as success.
5. Failures are logged and shown as a herdr toast if possible, otherwise in the log.

The typed name becomes the space label, which is the descriptive title shown in the sidebar.

## Menu (ctrl+shift+m)

A popup list for the focused space. Arrow keys move, enter runs, typing filters, esc closes. Items that don't apply are hidden (for example "Open PR" when there is no PR).

- **This space**
  - New worktree + Claude…
  - Open PR #n in browser
  - Open latest release / CI run
  - Open repo on GitHub
- **Tidy up**
  - Clean up workstreams…
  - Refresh now (also shows the last error, if any)
- **Setup**
  - Pin / unpin this space
  - Open config file
  - Check setup: Node version, git, gh installed and signed in, herdr version, the config.toml snippet present

GitHub links open with `gh browse` / `gh pr view --web`. Other URLs open with `start` (Windows), `open` (macOS) or `xdg-open` (Linux).

## Clean up workstreams

A workstream is a linked worktree plus its herdr space and the agents in it.

1. Gather linked worktrees for every repo that has a main space open or pinned (`git worktree list --porcelain`). The main checkout is never included.
2. A worktree is a candidate when its branch is merged into origin's default branch, or its PR is merged, or its last commit is older than `staleDays` and it has no open PR. Prunable entries, whose folder is already gone, are listed too and fixed with `git worktree prune`.
3. The popup lists the candidates with their reason (merged, PR #n merged, stale 45 days, folder missing) and any warnings:
   - **dirty**: cannot be ticked;
   - **agent running**: can be ticked, and the confirmation says the agent will be stopped.
4. Space bar ticks a worktree, and `b` additionally ticks "delete branch". Enter shows a confirmation summary, and a second enter runs it.
5. For each ticked workstream, in order: close its herdr space if open, run `git worktree remove <path>` (never `--force`), then `git branch -d <branch>` if ticked (`-d`, not `-D`, so unmerged branches survive and are reported). Each step's result is shown, and one failure doesn't stop the rest.

## Error handling

The sidebar never shows error boxes; it degrades quietly:

- `gh` missing or signed out: main spaces show one dim line, `gh not signed in`, and local lines keep working.
- Offline or GitHub errors: last values stay up, dimmed and marked `stale`.
- No GitHub remote: local lines only.
- herdr gone: the daemon exits, and tokens expire through their TTL.
- Every failure goes to `herdr-hub.log`. "Refresh now" and "Check setup" surface it.

## Code layout

Small files with one job each. Pure logic is kept apart from I/O so it can be tested with fixtures.

```
herdr-plugin.toml
src/
  io/herdr.ts        herdr CLI wrapper (HERDR_BIN_PATH), JSON parsing
  io/git.ts          git commands
  io/github.ts       gh wrapper: GraphQL PR query, deployments, releases, runs
  io/open.ts         cross-platform URL opener
  config.ts          load and validate config.json, defaults, save
  state.ts           state dir, lock files, log, refresh trigger
  model/classify.ts  space type from herdr + git data
  model/checks.ts    statusCheckRollup -> ✓ ✗ ⋯ none
  model/release.ts   pick the latest release from the three sources
  model/lines.ts     build the $hub1..4 lines for a space
  model/cleanup.ts   choose cleanup candidates and their warnings
  pinned.ts          restore pinned spaces
  daemon.ts          background updater loop
  startup.ts         startup hook entry
  event.ts           event hook entry
  ui/tty.ts          raw-mode key input and ANSI drawing (list, multi-select, text prompt)
  ui/menu.ts         menu popup
  ui/new-worktree.ts new worktree popup + detached worker
  ui/cleanup.ts      cleanup popup
  ui/doctor.ts       check setup screen
test/
  *.test.ts          node:test unit tests for model/*, config.ts
  fixtures/          saved herdr, git and gh JSON
.github/workflows/test.yml   node --test on ubuntu, macos, windows
README.md
```

## Testing

- Unit tests (`node --test`) for everything under `model/` and for config loading, driven by fixture JSON captured from real herdr, git and gh output.
- GitHub Actions runs the tests on Windows, macOS and Linux on every push and PR.
- Manual checks on a real herdr (listed in the plan): line indentation, popup keys on Windows Terminal, new worktree end to end, cleanup on a throwaway repo, pinned-space restore after a close.

## Sharing

- Public repo `JoeR96/herdr-hub` with the `herdr-plugin` topic, so it appears in herdr's marketplace.
- Install: `herdr plugin install JoeR96/herdr-hub`. There are no build commands, because Node runs the `.ts` files directly.
- The README covers requirements, install, the config.toml snippet, terminal key notes, config.json and a short tour.

## Migrating this machine

Once the plugin works:

1. Copy the 9 entries from `%APPDATA%\herdr\hub-projects.txt` into `config.json`.
2. Unlink the local `joe.hub` plugin.
3. Replace the `prefix+a` / `ctrl+shift+n` popup bindings and the spaces rows in `config.toml` with the README snippet. Keep the `$flag` token in the first spaces row, after `state_icon`; the flag feature and `toggle-flag.ps1` stay as they are.
4. Unbind ctrl+shift+m in Windows Terminal.
5. Retire `workspaces.ps1`, `new-worktree-claude.ps1` and `new-claude.ps1`. `dispatch-task.ps1` (the dispatch-tasks skill) is untouched.
