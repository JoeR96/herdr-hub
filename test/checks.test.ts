import { test } from "node:test";
import assert from "node:assert/strict";
import { rollupState, runState, deploymentState, symbol } from "../src/model/checks.ts";

test("rollupState maps GitHub's combined check state", () => {
  assert.equal(rollupState("SUCCESS"), "success");
  assert.equal(rollupState("FAILURE"), "failure");
  assert.equal(rollupState("ERROR"), "failure");
  assert.equal(rollupState("PENDING"), "pending");
  assert.equal(rollupState("EXPECTED"), "pending");
  assert.equal(rollupState(null), "none");
  assert.equal(rollupState(undefined), "none");
});

test("runState maps workflow run status and conclusion", () => {
  assert.equal(runState("in_progress", null), "pending");
  assert.equal(runState("queued", null), "pending");
  assert.equal(runState("completed", "success"), "success");
  assert.equal(runState("completed", "failure"), "failure");
  assert.equal(runState("completed", "cancelled"), "failure");
  assert.equal(runState("completed", "skipped"), "none");
});

test("deploymentState treats superseded deployments as successful", () => {
  assert.equal(deploymentState("SUCCESS"), "success");
  assert.equal(deploymentState("INACTIVE"), "success");
  assert.equal(deploymentState("IN_PROGRESS"), "pending");
  assert.equal(deploymentState("FAILURE"), "failure");
  assert.equal(deploymentState(null), "none");
});

test("symbol gives one glyph per state", () => {
  assert.deepEqual(["success", "failure", "pending", "none"].map((s) => symbol(s as never)), ["✓", "✗", "⋯", ""]);
});
