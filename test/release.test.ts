import { test } from "node:test";
import assert from "node:assert/strict";
import { pickRelease } from "../src/model/release.ts";

const pattern = /release|deploy|publish/i;
const dep = (environment: string, createdAt: string, state = "SUCCESS") =>
  ({ environment, createdAt, latestStatus: { state, environmentUrl: `https://${environment}.example.dev`, logUrl: null } });
const run = (name: string, created_at: string, conclusion = "success") =>
  ({ name, path: ".github/workflows/x.yml", status: "completed", conclusion, html_url: `https://github.com/acme/w/actions/runs/${created_at}`, created_at });

test("prefers a Production deployment over a newer Preview one", () => {
  const r = pickRelease([dep("Preview", "2026-10-07T00:00:00Z"), dep("Production", "2026-10-06T00:00:00Z")], [], [], pattern);
  assert.equal(r?.name, "Production");
  assert.equal(r?.url, "https://Production.example.dev");
  assert.equal(r?.source, "deployment");
});

test("uses only release-like workflow runs", () => {
  const r = pickRelease([], [], [run("CI", "2026-10-09T00:00:00Z"), run("Release Widgets", "2026-10-08T00:00:00Z", "failure")], pattern);
  assert.equal(r?.name, "Release Widgets");
  assert.equal(r?.state, "failure");
});

test("matches the workflow file name too", () => {
  const r = pickRelease([], [], [{ ...run("Ship it", "2026-10-08T00:00:00Z"), path: ".github/workflows/deploy.yml" }], pattern);
  assert.equal(r?.name, "Ship it");
});

test("picks the most recent of deployment, release and workflow run", () => {
  const r = pickRelease(
    [dep("Production", "2026-10-01T00:00:00Z")],
    [{ name: null, tagName: "v1.2.0", url: "https://github.com/acme/w/releases/v1.2.0", publishedAt: "2026-10-05T00:00:00Z", isDraft: false }],
    [run("Release", "2026-10-03T00:00:00Z")],
    pattern);
  assert.equal(r?.name, "v1.2.0");
  assert.equal(r?.source, "release");
  assert.equal(r?.state, "success");
});

test("ignores draft releases and returns null when nothing applies", () => {
  const r = pickRelease([], [{ name: "x", tagName: "v0", url: "u", publishedAt: null, isDraft: true }], [run("CI", "2026-10-03T00:00:00Z")], pattern);
  assert.equal(r, null);
});
