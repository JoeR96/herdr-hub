import { test } from "node:test";
import assert from "node:assert/strict";
import { openerCommand } from "../src/io/open.ts";

test("openerCommand picks the platform's opener without a shell", () => {
  const url = "https://example.dev/a?b=1&c=2";
  assert.deepEqual(openerCommand(url, "win32"), ["rundll32", ["url.dll,FileProtocolHandler", url]]);
  assert.deepEqual(openerCommand(url, "darwin"), ["open", [url]]);
  assert.deepEqual(openerCommand(url, "linux"), ["xdg-open", [url]]);
});
