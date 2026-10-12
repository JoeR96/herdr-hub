import { test } from "node:test";
import assert from "node:assert/strict";
import { openerCommand, isWebUrl } from "../src/io/open.ts";

test("only http and https links count as web links", () => {
  assert.equal(isWebUrl("https://github.com/acme/w/pull/7"), true);
  assert.equal(isWebUrl("http://localhost:3000"), true);
  for (const bad of ["\\\\host\\share\\x.exe", "file:///C:/x.exe", "C:\\x.exe", "javascript:alert(1)", "", " https://x.dev"]) {
    assert.equal(isWebUrl(bad), false, bad);
  }
});

test("openerCommand picks the platform's opener without a shell", () => {
  const url = "https://example.dev/a?b=1&c=2";
  assert.deepEqual(openerCommand(url, "win32"), ["rundll32", ["url.dll,FileProtocolHandler", url]]);
  assert.deepEqual(openerCommand(url, "darwin"), ["open", [url]]);
  assert.deepEqual(openerCommand(url, "linux"), ["xdg-open", [url]]);
});
