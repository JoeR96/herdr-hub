import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { compareVersions, herdrConfigPath, snippetChecks } from "../src/ui/doctor.ts";

test("compareVersions compares numerically", () => {
  assert.ok(compareVersions("0.9.1", "0.9.0") > 0);
  assert.ok(compareVersions("0.10.0", "0.9.9") > 0);
  assert.equal(compareVersions("24.0.0", "24.0.0"), 0);
  assert.ok(compareVersions("23.1.0", "24.0.0") < 0);
});

test("herdr's config.toml sits three levels above the plugin config folder", () => {
  assert.equal(herdrConfigPath(join("/cfg", "herdr", "plugins", "config", "herdr-hub")), join("/cfg", "herdr", "config.toml"));
});

test("snippetChecks spots the sidebar rows and both hotkeys", () => {
  const ok = snippetChecks('rows = [["$hub1"]]\ncommand = "herdr-hub.menu"\ncommand = "herdr-hub.new-worktree"');
  assert.ok(ok.every((c) => c.ok));
  const missing = snippetChecks("");
  assert.equal(missing.filter((c) => !c.ok).length, 3);
  assert.equal(snippetChecks(null)[0].ok, false);
});
