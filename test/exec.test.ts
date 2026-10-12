import { test } from "node:test";
import assert from "node:assert/strict";
import { run } from "../src/io/exec.ts";

test("run captures stdout and the exit code", async () => {
  const r = await run(process.execPath, ["-e", "process.stdout.write('hi'); process.exit(3)"]);
  assert.equal(r.stdout, "hi");
  assert.equal(r.code, 3);
  assert.equal(r.missing, false);
});

test("run reports a missing program instead of throwing", async () => {
  const r = await run("definitely-not-a-real-program-xyz", []);
  assert.equal(r.missing, true);
  assert.notEqual(r.code, 0);
});
