import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repoWithWorktree } from "./evidence/helpers.ts";
import { gitInfo } from "../claude-evidence/lib/git.ts";
import { addItem, markPublished } from "../claude-evidence/lib/store.ts";
import { readEvidence } from "../src/io/evidence.ts";

test("readEvidence reports the page link and unpublished count", () => {
  assert.equal(readEvidence(mkdtempSync(join(tmpdir(), "ev-none-"))), null);
  const { wt } = repoWithWorktree();
  const info = gitInfo(wt)!;
  const add = () => addItem(info.top, info.commonDir, { kind: "note", caption: "n", source: null, now: new Date() });
  add();
  assert.deepEqual(readEvidence(wt), { url: null, unpublished: 1 });
  markPublished(info.top, "https://claude.ai/artifact/a", new Date());
  assert.deepEqual(readEvidence(wt), { url: "https://claude.ai/artifact/a", unpublished: 0 });
  writeFileSync(join(wt, ".evidence", "evidence.json"), "{bad");
  assert.equal(readEvidence(wt), null);
});
