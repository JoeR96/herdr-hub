import { test } from "node:test";
import assert from "node:assert/strict";
import { missingPinned } from "../src/pinned.ts";

test("missingPinned lists pinned labels with no open space, in config order", () => {
  const pinned = [{ label: "a", path: "/a" }, { label: "b", path: "/b" }, { label: "c", path: "/c" }];
  assert.deepEqual(missingPinned(pinned, ["b", "other"]), [{ label: "a", path: "/a" }, { label: "c", path: "/c" }]);
  assert.deepEqual(missingPinned(pinned, ["a", "b", "c"]), []);
});
