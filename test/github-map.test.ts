import { test } from "node:test";
import assert from "node:assert/strict";
import { mapRepo } from "../src/model/github-map.ts";

const gql = {
  data: {
    repository: {
      defaultBranchRef: { name: "main" },
      pullRequests: { nodes: [
        { number: 7, title: "Add stairs", isDraft: true, url: "https://github.com/acme/w/pull/7", headRefName: "feature/stairs",
          commits: { nodes: [{ commit: { statusCheckRollup: { state: "SUCCESS" } } }] } },
        { number: 8, title: "No checks", isDraft: false, url: "https://github.com/acme/w/pull/8", headRefName: "fix/x",
          commits: { nodes: [{ commit: { statusCheckRollup: null } }] } },
      ] },
      releases: { nodes: [] },
      deployments: { nodes: [] },
    },
  },
};
const runs = { workflow_runs: [{ name: "Release", path: ".github/workflows/release.yml", status: "completed", conclusion: "success", html_url: "https://github.com/acme/w/actions/runs/1", created_at: "2026-10-08T00:00:00Z" }] };

test("mapRepo turns the GraphQL and runs responses into RepoData", () => {
  const d = mapRepo(gql, runs, /release/i);
  assert.equal(d.defaultBranch, "main");
  assert.deepEqual(d.prs.map((p) => [p.number, p.isDraft, p.headRefName, p.checks]), [[7, true, "feature/stairs", "success"], [8, false, "fix/x", "none"]]);
  assert.equal(d.release?.name, "Release");
});

test("mapRepo throws GitHub's error message when the repository is missing", () => {
  assert.throws(() => mapRepo({ data: { repository: null }, errors: [{ message: "Could not resolve to a Repository" }] }, {}, /x/), /Could not resolve/);
});

test("mapRepo tolerates a missing runs response", () => {
  assert.equal(mapRepo(gql, null, /release/i).release, null);
});
