import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanPath, normPath, samePath } from "../src/model/paths.ts";

test("normPath strips the long-path prefix, unifies slashes and lowercases on Windows", () => {
  assert.equal(normPath("\\\\?\\C:\\Users\\Me\\My Repo\\", "win32"), "c:/users/me/my repo");
  assert.equal(normPath("C:/Users/Me/My Repo", "win32"), "c:/users/me/my repo");
});

test("normPath keeps case on macOS and Linux", () => {
  assert.equal(normPath("/Users/Me/Repo/", "darwin"), "/Users/Me/Repo");
});

test("roots stay roots", () => {
  assert.equal(normPath("/", "linux"), "/");
  assert.equal(normPath("C:\\", "win32"), "c:/");
});

test("samePath compares normalised forms", () => {
  assert.ok(samePath("D:\\x\\My Repo", "d:/x/my repo", "win32"));
  assert.ok(!samePath("/a/B", "/a/b", "linux"));
});

test("cleanPath strips only the long-path prefix", () => {
  assert.equal(cleanPath("\\\\?\\C:\\Repo"), "C:\\Repo");
  assert.equal(cleanPath("/tmp/x"), "/tmp/x");
});
