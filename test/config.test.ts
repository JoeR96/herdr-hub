import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseConfig, defaults, loadConfig, saveConfig, savePinned, togglePin } from "../src/config.ts";

test("missing or empty config gives the defaults with no errors", () => {
  assert.deepEqual(parseConfig(null), { config: defaults(), errors: [] });
  assert.deepEqual(parseConfig("  "), { config: defaults(), errors: [] });
});

test("valid values override defaults", () => {
  const { config, errors } = parseConfig(JSON.stringify({
    pinned: [{ label: "site", path: "C:/dev/site" }],
    refresh: { localSeconds: 20 }, cleanup: { staleDays: 10 },
    releaseWorkflowPattern: "ship", newWorktree: { branchPrefix: "wip/" }, indent: "bar",
  }));
  assert.deepEqual(errors, []);
  assert.deepEqual(config.pinned, [{ label: "site", path: "C:/dev/site" }]);
  assert.equal(config.refresh.localSeconds, 20);
  assert.equal(config.refresh.githubSeconds, 180);
  assert.equal(config.cleanup.staleDays, 10);
  assert.equal(config.releaseWorkflowPattern, "ship");
  assert.equal(config.newWorktree.branchPrefix, "wip/");
  assert.equal(config.indent, "bar");
});

test("bad values fall back to defaults and are reported", () => {
  const { config, errors } = parseConfig(JSON.stringify({
    pinned: [{ label: "" , path: "x" }, { label: "a", path: "p" }, { label: "a", path: "q" }],
    refresh: { localSeconds: 1 }, releaseWorkflowPattern: "(", indent: "fancy",
  }));
  assert.deepEqual(config.pinned, [{ label: "a", path: "p" }]);
  assert.equal(config.refresh.localSeconds, 15);
  assert.equal(config.releaseWorkflowPattern, "release|deploy|publish");
  assert.equal(config.indent, "blank");
  assert.equal(errors.length, 5);
});

test("invalid JSON is reported, not thrown", () => {
  const { config, errors } = parseConfig("{ nope");
  assert.deepEqual(config, defaults());
  assert.match(errors[0], /not valid JSON/);
});

test("savePinned changes only the pinned list and keeps everything else in the file", () => {
  const dir = mkdtempSync(join(tmpdir(), "hub-pin-"));
  writeFileSync(join(dir, "config.json"), JSON.stringify({ pinned: [{ label: "a", path: "/a" }], refresh: { localSeconds: 1 }, myNote: "keep me" }));
  savePinned(dir, [{ label: "a", path: "/a" }, { label: "b", path: "/b" }]);
  const raw = JSON.parse(readFileSync(join(dir, "config.json"), "utf8"));
  assert.deepEqual(raw.pinned, [{ label: "a", path: "/a" }, { label: "b", path: "/b" }]);
  assert.equal(raw.refresh.localSeconds, 1, "an invalid value the user is still editing must not be replaced");
  assert.equal(raw.myNote, "keep me");
});

test("savePinned refuses to overwrite a config.json that isn't valid JSON", () => {
  const dir = mkdtempSync(join(tmpdir(), "hub-pin-"));
  writeFileSync(join(dir, "config.json"), "{ half typed");
  assert.throws(() => savePinned(dir, [{ label: "b", path: "/b" }]), /not valid JSON/);
  assert.equal(readFileSync(join(dir, "config.json"), "utf8"), "{ half typed");
});

test("save then load round-trips, and togglePin adds then removes", () => {
  const dir = join(mkdtempSync(join(tmpdir(), "hub-cfg-")), "nested");
  const added = togglePin(defaults(), "site", "C:/dev/site");
  assert.equal(added.pinned, true);
  saveConfig(dir, added.config);
  assert.deepEqual(loadConfig(dir).config.pinned, [{ label: "site", path: "C:/dev/site" }]);
  const removed = togglePin(added.config, "site", "C:/dev/site");
  assert.equal(removed.pinned, false);
  assert.deepEqual(removed.config.pinned, []);
});
