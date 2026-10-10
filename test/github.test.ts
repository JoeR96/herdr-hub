import { test } from "node:test";
import assert from "node:assert/strict";
import { ghStatus, REPO_QUERY } from "../src/io/github.ts";

test("ghStatus reports a missing gh instead of throwing", async () => {
  assert.equal(await ghStatus("definitely-not-gh-xyz"), "missing");
});

test("the repo query asks for everything the sidebar needs", () => {
  for (const field of ["pullRequests(states: OPEN", "statusCheckRollup", "releases(", "deployments(", "defaultBranchRef"]) {
    assert.ok(REPO_QUERY.includes(field), field);
  }
});
