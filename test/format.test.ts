import { test } from "node:test";
import assert from "node:assert/strict";
import { age, cellWidth, cutCells } from "../src/model/format.ts";

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

test("cellWidth counts terminal cells per grapheme", () => {
  assert.equal(cellWidth("abc"), 3);
  assert.equal(cellWidth("✓●⇡…⠀│"), 6);
  assert.equal(cellWidth("日本"), 4);
  assert.equal(cellWidth("🚀"), 2);
  assert.equal(cellWidth("👨‍👩‍👧"), 2);
  assert.equal(cellWidth("é"), 1);
});

test("cutCells never splits a grapheme and fits the ellipsis in the budget", () => {
  assert.equal(cutCells("abcdef", 4), "abc…");
  assert.equal(cutCells("日本語", 4), "日…");
  assert.equal(cutCells("a👨‍👩‍👧b", 3), "a…");
  assert.equal(cutCells("short", 9), "short");
});
