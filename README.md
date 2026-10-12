# herdr hub

A [herdr](https://herdr.dev) plugin that turns herdr into a home base for all your projects.

- **Pinned spaces.** The projects you choose always have a space, even with nothing running in them. Close one and it comes back.
- **Status in the sidebar.** Each project space shows its branch and its latest release or deploy. Each worktree space shows its agent, its branch and its pull request with check results.
- **New worktree + Claude on one key.** Type a name and you get a new branch, a worktree, a space for it and Claude Code running inside.
- **A menu of utilities.** Open the PR, the release or the repo in your browser, clean up finished workstreams, pin a space, and check your setup.

It works on Windows, macOS and Linux, in any terminal herdr runs in.

## What you need

- herdr 0.9.0 or newer
- Node 24 or newer (the plugin runs its TypeScript files directly, so there is nothing to build)
- git
- The [GitHub CLI](https://cli.github.com), signed in with `gh auth login`

Without the GitHub CLI the local parts still work: branch, agent and pinned spaces.

## Install

```sh
herdr plugin install JoeR96/herdr-hub
```

## Set up herdr's config.toml

A plugin can't edit herdr's config, so add these yourself. Run `herdr config check` to find the file.

The plugin reports each part separately (agent, branch, git state, PR, checks, release, evidence), so your config decides where each one goes and what colour it is. Rows with nothing to show disappear, and long names wrap onto their `…2` row. The icons need a [Nerd Font](https://www.nerdfonts.com/) in your terminal. Replace your `[ui.sidebar.spaces]` rows with:

```toml
[ui.sidebar.spaces]
rows = [
  ["state_icon", "workspace", { token = "state_text", rules = [{ equals = "unknown", hide = true }] }],
  [{ token = "$hub_agent", fg = "#a8a8a8" }],
  [{ token = "$hub_agent2", fg = "#a8a8a8" }],
  [{ token = "$hub_branch", fg = "#61d6d6" }],
  [{ token = "$hub_branch2", fg = "#61d6d6" }],
  [{ token = "$hub_git", fg = "#16c60c", rules = [{ contains = "changes", fg = "#f9f1a5" }] }, { token = "$hub_ahead", fg = "#5c9cff" }, { token = "$hub_behind", fg = "#fb7e14" }],
  [{ token = "$hub_pr", fg = "#c586c0", rules = [{ contains = "draft", dim = true }] }, { token = "$hub_checks", fg = "#16c60c", rules = [{ contains = "failed", fg = "#e74856" }, { contains = "running", fg = "#f9f1a5" }, { contains = "no checks", fg = "#8a8a8a" }, { contains = "stale", dim = true }] }],
  [{ token = "$hub_checks2", fg = "#16c60c", rules = [{ contains = "failed", fg = "#e74856" }, { contains = "running", fg = "#f9f1a5" }, { contains = "no checks", fg = "#8a8a8a" }, { contains = "stale", dim = true }] }],
  [{ token = "$hub_release", fg = "#cccccc" }, { token = "$hub_release_state", fg = "#16c60c", rules = [{ equals = "\u2717", fg = "#e74856" }, { equals = "\uF017", fg = "#f9f1a5" }] }, { token = "$hub_release_age", dim = true }],
  [{ token = "$hub_release2", fg = "#cccccc" }],
  [{ token = "$hub_evidence", fg = "#cccccc" }, { token = "$hub_evidence_state", fg = "#16c60c", rules = [{ contains = "to publish", fg = "#fb7e14", bold = true }] }],
  [{ token = "$hub_evidence_state2", fg = "#16c60c", rules = [{ contains = "to publish", fg = "#fb7e14", bold = true }] }],
  [{ token = "$hub_problem", fg = "#e74856" }],
]
```

| Colour | Means |
| --- | --- |
| cyan | branch |
| green | clean, checks passed, release succeeded, evidence up to date |
| yellow | uncommitted changes, checks or release still running |
| red | checks or release failed, GitHub problem |
| blue / orange | commits ahead / behind the upstream |
| purple | pull request (dimmed while it's a draft) |
| orange, bold | evidence waiting to be published |
| grey / dim | agent title, ages, drafts and anything stale |

Then bind the two hotkeys:

```toml
[[keys.command]]
key = "ctrl+shift+m"
type = "plugin_action"
command = "herdr-hub.menu"

[[keys.command]]
key = "ctrl+shift+n"
type = "plugin_action"
command = "herdr-hub.new-worktree"
```

Apply the changes with `herdr server reload-config`.

### Terminal notes

- **Windows Terminal** uses ctrl+shift+m (mark mode) and ctrl+shift+n (new window) itself. Unbind them in its `settings.json`, under `keybindings`:

  ```json
  { "id": null, "keys": "ctrl+shift+m" },
  { "id": null, "keys": "ctrl+shift+n" }
  ```

- **On Windows, don't use ctrl+alt+letter.** Many keyboard layouts treat ctrl+alt as AltGr, so the key never reaches herdr.
- **Ghostty and other terminals:** if a key clashes with one of your terminal's shortcuts, pick a different key in the `[[keys.command]]` blocks.

## Configure it

The plugin's settings live in `config.json` in the folder printed by `herdr plugin config-dir herdr-hub`. Every key is optional. These are the defaults:

```json
{
  "pinned": [],
  "refresh": { "localSeconds": 15, "githubSeconds": 180 },
  "cleanup": { "staleDays": 30 },
  "releaseWorkflowPattern": "release|deploy|publish",
  "newWorktree": { "branchPrefix": "feature/" },
  "indent": "blank"
}
```

- **pinned:** the spaces to keep open, each as `{ "label": "my site", "path": "C:/dev/my-site" }`. You can also use "Pin this space" in the menu. Spaces are matched by label, so if you rename a pinned space a fresh one appears with the old name.
- **refresh:** how often the sidebar reads local state (branch, agents) and GitHub.
- **cleanup.staleDays:** how many days without a commit before a worktree with no open PR counts as stale.
- **releaseWorkflowPattern:** which GitHub Actions workflows count as releases, matched against the workflow name and file name.
- **newWorktree.branchPrefix:** put in front of the name you type. "stairs fix" becomes `feature/stairs-fix`. Type `fix/stairs` to choose the whole branch name yourself.
- **indent:** `"blank"` indents the sidebar lines with an invisible character. If your font shows it as dots or boxes, use `"bar"` instead.

## What the sidebar shows

A project space (the repo's main folder), each part in its own colour:

```
     main
    ✓ clean · ↑2
     Release · ✓ · 2d ago
```

A worktree space:

```
       stairs fix
       feature/stairs-fix
      ● changes · ↑3
       #7 draft · ✓ checks passed
       evidence · 3 to publish
```

| Mark | Meaning |
| --- | --- |
| ✓ clean / ● changes | no uncommitted changes / some |
| ↑2 ↓1 | commits ahead of / behind the upstream branch |
| ✓ ✗  | passed, failed, still running (checks and releases) |
| stale | GitHub couldn't be reached; these are the last known values |
| gh not signed in | run `gh auth login` |
| evidence · ✓ up to date | this worktree's evidence page is current (see below) |
| evidence · 3 to publish | 3 evidence items are waiting to be published |

The release line is the newest of three things GitHub knows about:

1. **Deployments.** Production is preferred. Vercel and most hosts that are connected to GitHub report these.
2. **Published GitHub releases.**
3. **Workflow runs** whose name or file matches `releaseWorkflowPattern`. This includes self-hosted runners.

Pull requests only show on the worktree space for their branch. PRs with no open space aren't shown.

herdr cuts sidebar lines at its edge rather than wrapping them, so the hub wraps long branch, agent and release names onto a second line. It measures against the sidebar width (a width you dragged, otherwise `sidebar_width` from config.toml), and the next refresh picks up any change.

## Evidence pages

When Claude works in a worktree, it can save proof as it goes: screenshots, recordings, test output, diffs. It then publishes them as one private Claude Artifact page for that worktree. The worktree gets an evidence line (`evidence · ✓ up to date`), and the hub menu gets **Open evidence page**.

The tool, skill and Claude hooks live in [`claude-evidence/`](claude-evidence/README.md). Install them with `node claude-evidence/install.ts`. Without them, the hub never shows any evidence.

## Cleaning up workstreams

"Clean up workstreams…" in the menu lists worktrees that look finished:

- **merged:** the branch has no commits that aren't already on the default branch
- **PR merged:** its pull request was merged
- **stale:** no commits for `staleDays` and no open PR
- **folder missing:** git still lists it but the folder is gone

Press space to tick a worktree, and `b` to also delete its branch. Nothing happens until you confirm.

It is careful by design:

- It never forces anything. A worktree with uncommitted changes can't be ticked, and git refuses to remove one that has any.
- It deletes branches with `git branch -d`, so a branch with unmerged work is kept and reported.
- It never touches the repo's main folder.
- If the worktree has a space open, the space closes first, along with any agent in it.

## Troubleshooting

- Open the menu and choose **Check setup**. It checks Node, git, the GitHub CLI, herdr, the config.toml snippet, config.json and the sidebar updater.
- The plugin logs to `herdr-hub.log` in its state folder. "Refresh now" in the menu shows the latest problems.

## Licence

MIT
