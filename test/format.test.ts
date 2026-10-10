import { test } from "node:test";
import assert from "node:assert/strict";
import { age } from "../src/model/format.ts";

const now = Date.parse("2026-10-10T12:00:00Z");

test("age gives short human durations", () => {
  assert.equal(age(now - 20_000, now), "just now");
  assert.equal(age(now - 5 * 60_000, now), "5m ago");
  assert.equal(age(now - 3 * 3_600_000, now), "3h ago");
  assert.equal(age(now - 2 * 86_400_000, now), "2d ago");
  assert.equal(age(now - 21 * 86_400_000, now), "3w ago");
});

test("age treats future times as just now", () => {
  assert.equal(age(now + 60_000, now), "just now");
});
