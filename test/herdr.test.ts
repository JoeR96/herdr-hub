import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Herdr, HerdrError } from "../src/io/herdr.ts";

const fake = fileURLToPath(new URL("./fixtures/fake-herdr.mjs", import.meta.url));
const herdr = () => new Herdr(process.execPath, [fake]);

test("call returns .result and records arguments", async () => {
  const out = join(mkdtempSync(join(tmpdir(), "hub-herdr-")), "args");
  process.env.FAKE_OUT = out;
  process.env.FAKE_REPLY = '{"id":"x","result":{"type":"workspace_info","workspace":{"workspace_id":"w7"}}}';
  assert.equal(await herdr().createWorkspace("C:/dev/site", "site"), "w7");
  await herdr().reportTokens("w7", { hub1: "a=b", hub2: null }, 30000);
  const calls = readFileSync(out, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.deepEqual(calls[0], ["workspace", "create", "--cwd", "C:/dev/site", "--label", "site", "--no-focus"]);
  assert.deepEqual(calls[1], ["workspace", "report-metadata", "w7", "--source", "herdr-hub", "--ttl-ms", "30000", "--token", "hub1=a=b", "--clear-token", "hub2"]);
  delete process.env.FAKE_OUT; delete process.env.FAKE_REPLY;
});

test("a non-zero exit or an error reply becomes HerdrError", async () => {
  process.env.FAKE_CODE = "1";
  await assert.rejects(herdr().call(["workspace", "list"]), HerdrError);
  delete process.env.FAKE_CODE;
  process.env.FAKE_REPLY = '{"id":"x","error":{"code":"not_found","message":"no such workspace"}}';
  await assert.rejects(herdr().closeWorkspace("w0"), /no such workspace/);
  delete process.env.FAKE_REPLY;
});

test("snapshot fills in missing lists", async () => {
  process.env.FAKE_REPLY = '{"id":"x","result":{"snapshot":{"workspaces":[{"workspace_id":"w1","label":"a"}]}}}';
  const s = await herdr().snapshot();
  assert.equal(s.workspaces.length, 1);
  assert.deepEqual(s.panes, []);
  assert.deepEqual(s.agents, []);
  delete process.env.FAKE_REPLY;
});

test("startAgent treats agent_not_ready as started", async () => {
  process.env.FAKE_CODE = "1";
  process.env.FAKE_REPLY = '{"id":"x","error":{"code":"agent_not_ready","message":"startup screen"}}';
  assert.equal((await herdr().startAgent("a", "w1:p1", [])).ok, true);
  delete process.env.FAKE_CODE; delete process.env.FAKE_REPLY;
});
