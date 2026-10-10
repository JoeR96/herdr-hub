import { test } from "node:test";
import assert from "node:assert/strict";
import { parseKeys, initialList, reduceList, renderList, visibleItems, fit } from "../src/ui/tty.ts";

test("parseKeys reads normal and application-mode arrows, enter, escape and text", () => {
  assert.deepEqual(parseKeys("\x1b[A\x1bOB\r\n\x1b x\x7f\x03").map((k) => k.ch ? `${k.name}:${k.ch}` : k.name),
    ["up", "down", "enter", "escape", "space", "char:x", "backspace", "ctrl-c"]);
});

test("parseKeys skips other escape sequences such as Home or F-keys", () => {
  assert.deepEqual(parseKeys("\x1b[H\x1b[1;5C\x1b[15~a").map((k) => k.name), ["char"]);
});

const items = [
  { id: "a", label: "Open PR", section: "This space" },
  { id: "b", label: "Refresh now", section: "Tidy up" },
  { id: "c", label: "Clean up", section: "Tidy up", disabled: true },
];

test("single mode: arrows move, typing filters, enter selects, escape cancels", () => {
  let st = initialList(items);
  st = reduceList(st, { name: "down" }, "single").st;
  assert.equal(st.cursor, 1);
  assert.deepEqual(reduceList(st, { name: "enter" }, "single").result, { kind: "select", id: "b" });
  st = reduceList(initialList(items), { name: "char", ch: "r" }, "single").st;
  assert.deepEqual(visibleItems(st).map((i) => i.id), ["a", "b"]);
  st = reduceList(st, { name: "char", ch: "e" }, "single").st;
  st = reduceList(st, { name: "char", ch: "f" }, "single").st;
  assert.deepEqual(visibleItems(st).map((i) => i.id), ["b"]);
  assert.deepEqual(reduceList(st, { name: "escape" }, "single").result, { kind: "cancel" });
});

test("single mode: enter on a disabled item does nothing; cursor stays in range", () => {
  let st = initialList(items);
  st = reduceList(reduceList(reduceList(st, { name: "down" }, "single").st, { name: "down" }, "single").st, { name: "down" }, "single").st;
  assert.equal(st.cursor, 2);
  assert.equal(reduceList(st, { name: "enter" }, "single").result, null);
});

test("multi mode: space ticks enabled items only, enter returns ticked ids", () => {
  let st = initialList(items);
  st = reduceList(st, { name: "space" }, "multi").st;
  st = reduceList(reduceList(st, { name: "down" }, "multi").st, { name: "down" }, "multi").st;
  st = reduceList(st, { name: "space" }, "multi").st;
  assert.deepEqual(reduceList(st, { name: "enter" }, "multi").result, { kind: "done", ids: ["a"] });
});

test("renderList shows sections, the cursor, ticks and the footer, within the width", () => {
  const st = { ...initialList(items), checked: new Set(["a"]) };
  const out = renderList(st, { title: "Menu", footer: "esc closes", width: 30, height: 20, mode: "multi" });
  assert.match(out, /THIS SPACE/);
  assert.match(out, /▸ \[x\] Open PR/);
  assert.match(out, /\[-\] Clean up/);
  assert.match(out, /esc closes/);
  for (const line of out.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").split("\r\n")) assert.ok([...line].length <= 30, line);
});

test("fit truncates with an ellipsis", () => {
  assert.equal(fit("abcdef", 4), "abc…");
  assert.equal(fit("abc", 4), "abc");
});
