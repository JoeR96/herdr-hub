import { deploymentState, runState } from "./checks.ts";
import type { CheckState } from "./checks.ts";

export interface Release { source: "deployment" | "release" | "workflow"; name: string; state: CheckState; atMs: number; url: string | null }
export interface DeploymentNode { environment: string; createdAt: string; latestStatus: { state: string; environmentUrl?: string | null; logUrl?: string | null } | null }
export interface ReleaseNode { name: string | null; tagName: string; url: string; publishedAt: string | null; isDraft: boolean }
export interface RunNode { name: string; path: string; status: string; conclusion: string | null; html_url: string; created_at: string }

function latest<T>(items: T[], at: (t: T) => number): T | undefined {
  return items.slice().sort((a, b) => at(b) - at(a))[0];
}

export function pickRelease(deployments: DeploymentNode[], releases: ReleaseNode[], runs: RunNode[], pattern: RegExp): Release | null {
  const candidates: Release[] = [];

  const production = deployments.filter((d) => /^production$/i.test(d.environment));
  const dep = latest(production.length ? production : deployments, (d) => Date.parse(d.createdAt));
  if (dep) {
    candidates.push({
      source: "deployment", name: dep.environment, state: deploymentState(dep.latestStatus?.state),
      atMs: Date.parse(dep.createdAt), url: dep.latestStatus?.environmentUrl ?? dep.latestStatus?.logUrl ?? null,
    });
  }

  const rel = latest(releases.filter((r) => !r.isDraft && r.publishedAt), (r) => Date.parse(r.publishedAt!));
  if (rel) {
    candidates.push({ source: "release", name: rel.name || rel.tagName, state: "success", atMs: Date.parse(rel.publishedAt!), url: rel.url });
  }

  const run = latest(runs.filter((r) => pattern.test(r.name) || pattern.test(r.path)), (r) => Date.parse(r.created_at));
  if (run) {
    candidates.push({ source: "workflow", name: run.name, state: runState(run.status, run.conclusion), atMs: Date.parse(run.created_at), url: run.html_url });
  }

  return latest(candidates, (c) => c.atMs) ?? null;
}
