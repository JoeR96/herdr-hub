---
name: evidence
description: Use when working in a git worktree and you verify your work (screenshots, recordings, test or build runs, before/after comparisons), or when a Stop hook says the worktree has unpublished evidence items.
---

# Evidence pages

Each git worktree has one evidence page: a private Claude Artifact showing the proof that the work in it does what it should. herdr shows it on the worktree's sidebar row and opens it from the hub menu. You save proof while you work, then publish when the Stop hook asks.

Tool: `node "{{EVIDENCE}}" <command>`, run from anywhere inside the worktree. Below, `evidence` means that command.

## Saving proof as you go

Save it at the moment you check something, with a caption that says what it proves ("Login page renders after the fix", not "screenshot").

```
evidence add shot.png --caption "…"                                   # image, GIF or video; kind from extension
npm test 2>&1 | evidence add - --kind test-output --caption "…"       # command output
git diff main | evidence add - --kind diff --caption "…"              # diff
evidence add --kind note --caption "…"                                # something you checked with no file
```

Kinds: screenshot, gif, video, test-output, log, diff, note. Files over 15 MB are refused, and text over 200 KB keeps the tail. Everything goes in `<worktree>/.evidence/`, which is git-excluded, so never commit it.

Screenshots shown to you by browser or computer tools are **not on disk**. To get a file:
- Web page: `npx playwright screenshot --full-page http://localhost:3000 shot.png`
- Whole screen (Windows): `powershell -NoProfile -Command "Add-Type -A System.Windows.Forms,System.Drawing; $b=[Windows.Forms.Screen]::PrimaryScreen.Bounds; $i=New-Object Drawing.Bitmap $b.Width,$b.Height; [Drawing.Graphics]::FromImage($i).CopyFromScreen(0,0,0,0,$i.Size); $i.Save('shot.png')"`
- Anything already saved by a tool (GIF recorder, test reporter, Unity capture): pass its path.

Delete temporary capture files after `add`, because the tool keeps its own copy.

## Publishing

1. `evidence build` prints `{ page, files, url }`. The page is generated and already meets the Artifact page contract, so publish it as is. Don't load design skills or edit it.
2. If `url` is null: Artifact `publish` with `file_path` = page, `files` = the `files` object exactly as given (even when empty), `icon: "check"`, and a one-sentence `description`.
   If `url` is set: Artifact `read` it first (another session made it), then `publish` with `url`, `file_path` and `files`, and no icon.
3. `evidence published <url from the Artifact result>`. This records the link and starts the next round, which clears the Stop hook.
4. Tell the user the link in one line.

If the publish fails or is refused, tell the user and **don't** run `evidence published`.

## Common mistakes

- Saving proof at the end from memory. Capture it when you check.
- Captions that name the file instead of the claim.
- Saving secrets: check logs and screenshots for tokens, keys and personal data before `add`.
- Padding the page. Each item should prove something about this worktree's change.
