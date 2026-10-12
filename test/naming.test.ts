import { test } from "node:test";
import assert from "node:assert/strict";
import { planWorktree, initials, slugify } from "../src/model/naming.ts";

test("a plain name becomes a prefixed branch and an agent named after the space", () => {
  assert.deepEqual(planWorktree("Stairs fix", "feature/", "big daves bonanza"),
    { branch: "feature/stairs-fix", label: "Stairs fix", agentName: "bdb-stairs-fix" });
});

test("a name with a slash is used as the branch", () => {
  assert.deepEqual(planWorktree("fix/Stairs Edge", "feature/", "big daves bonanza"),
    { branch: "fix/stairs-edge", label: "fix/Stairs Edge", agentName: "bdb-stairs-edge" });
});

test("empty or symbol-only names are rejected", () => {
  assert.equal(planWorktree("   ", "feature/", "x"), null);
  assert.equal(planWorktree("!!!", "feature/", "x"), null);
});

test("agent names start with a letter and stay within 32 characters", () => {
  assert.equal(planWorktree("x", "feature/", "99 strength")?.agentName, "c-9s-x");
  const long = planWorktree("a really very long description of the work", "feature/", "site")!.agentName;
  assert.ok(long.length <= 32 && !long.endsWith("-"), long);
});

test("helpers", () => {
  assert.equal(initials("enjoeneer.dev"), "ed");
  assert.equal(initials("***"), "wt");
  assert.equal(slugify("  Hello, World!  "), "hello-world");
});
