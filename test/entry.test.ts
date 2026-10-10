import { test } from "node:test";
import assert from "node:assert/strict";
import { isEntry } from "../src/entry.ts";

test("isEntry is true for the file node was started with and false for anything imported", () => {
  // node --test runs each test file as its own process, so this file is the entry point here
  assert.equal(isEntry(import.meta.url), true);
  assert.equal(isEntry(new URL("../src/entry.ts", import.meta.url).href), false);
});
