import { rollupState } from "./checks.ts";
import type { CheckState } from "./checks.ts";
import { pickRelease } from "./release.ts";
import type { Release } from "./release.ts";

export interface PullRequest { number: number; title: string; url: string; isDraft: boolean; headRefName: string; checks: CheckState }
export interface RepoData { defaultBranch: string | null; prs: PullRequest[]; release: Release | null }

export function mapRepo(gql: any, runs: any, pattern: RegExp): RepoData {
  const repo = gql?.data?.repository;
  if (!repo) throw new Error(gql?.errors?.[0]?.message ?? "repository not found");
  const prs: PullRequest[] = (repo.pullRequests?.nodes ?? []).map((n: any) => ({
    number: n.number,
    title: n.title,
    url: n.url,
    isDraft: !!n.isDraft,
    headRefName: n.headRefName,
    checks: rollupState(n.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state),
  }));
  const release = pickRelease(repo.deployments?.nodes ?? [], repo.releases?.nodes ?? [], runs?.workflow_runs ?? [], pattern);
  return { defaultBranch: repo.defaultBranchRef?.name ?? null, prs, release };
}
