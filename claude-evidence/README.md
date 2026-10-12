# claude-evidence

Gives each git worktree one evidence page: a private Claude Artifact with the screenshots, recordings, test output and diffs Claude used to check its work. herdr hub shows `· evidence` on the worktree's sidebar row and adds "Open evidence page" to its menu.

## Install

```
node claude-evidence/install.ts
```

This copies the tool to `~/.claude/evidence/`, writes the `evidence` skill to `~/.claude/skills/evidence/`, and adds two hooks to `~/.claude/settings.json`. The file is backed up first, and any hooks you already have stay in place. Run it again after pulling changes. It is safe to re-run.

- **SessionStart**: in a linked worktree, reminds Claude to save proof as it works.
- **Stop**: when the worktree has evidence that isn't on the page yet, asks Claude to publish once before finishing.

Neither hook does anything outside linked worktrees. If something goes wrong, both exit quietly and let Claude carry on.

## How it works

Evidence lives in `<worktree>/.evidence/`. That folder is added to the repo's git exclude, so it is never committed.

| File | What it holds |
|---|---|
| `evidence.json` | saved items, grouped into rounds |
| `files/` | copies of the evidence files |
| `site/index.html` | the generated page |
| `artifact.json` | the page's link and the last round published |

Each publish updates the same link and starts a new round. Rounds are shown newest first.

## Commands

```
evidence add <file|-> [--kind <kind>] --caption "<text>"
evidence add --kind note --caption "<text>"
evidence build
evidence published <url>
evidence status
```

Kinds: screenshot, gif, video, test-output, log, diff, note.
