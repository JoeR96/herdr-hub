import { run } from "./exec.ts";
import { mapRepo } from "../model/github-map.ts";
import type { RepoData } from "../model/github-map.ts";

export const REPO_QUERY = `query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    defaultBranchRef { name }
    pullRequests(states: OPEN, first: 50, orderBy: {field: UPDATED_AT, direction: DESC}) {
      nodes { number title isDraft url headRefName commits(last: 1) { nodes { commit { statusCheckRollup { state } } } } }
    }
    releases(first: 5, orderBy: {field: CREATED_AT, direction: DESC}) {
      nodes { name tagName url publishedAt isDraft }
    }
    deployments(first: 20, orderBy: {field: CREATED_AT, direction: DESC}) {
      nodes { environment createdAt latestStatus { state environmentUrl logUrl } }
    }
  }
}`;

export async function ghStatus(bin = "gh"): Promise<"ok" | "missing" | "signed-out"> {
  const r = await run(bin, ["auth", "status"], { timeoutMs: 20_000 });
  if (r.missing) return "missing";
  return r.code === 0 ? "ok" : "signed-out";
}

async function ghJson(args: string[]): Promise<any> {
  const r = await run("gh", args, { timeoutMs: 60_000 });
  if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim() || `gh ${args[0]} failed`);
  return JSON.parse(r.stdout);
}

export async function fetchRepoData(owner: string, name: string, pattern: RegExp): Promise<RepoData> {
  const gql = await ghJson(["api", "graphql", "-f", `query=${REPO_QUERY}`, "-f", `owner=${owner}`, "-f", `name=${name}`]);
  // repos with Actions disabled answer 404 here; that only means "no workflow runs"
  const runs = await ghJson(["api", `repos/${owner}/${name}/actions/runs?per_page=30`]).catch(() => ({ workflow_runs: [] }));
  return mapRepo(gql, runs, pattern);
}

export async function mergedPrBranches(owner: string, name: string): Promise<Map<string, number>> {
  const list = await ghJson(["pr", "list", "-R", `${owner}/${name}`, "--state", "merged", "-L", "100", "--json", "number,headRefName"]);
  return new Map(list.map((p: { number: number; headRefName: string }) => [p.headRefName, p.number]));
}

export async function openPrBranches(owner: string, name: string): Promise<Set<string>> {
  const list = await ghJson(["pr", "list", "-R", `${owner}/${name}`, "--state", "open", "-L", "200", "--json", "headRefName"]);
  return new Set(list.map((p: { headRefName: string }) => p.headRefName));
}
