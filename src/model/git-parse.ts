export interface GitStatus { branch: string | null; upstream: string | null; ahead: number; behind: number; dirty: boolean }
export interface WorktreeEntry { path: string; head: string; branch: string | null; prunable: boolean; isMain: boolean }
export interface GitHubRepo { owner: string; name: string }

export function parseStatusV2(text: string): GitStatus {
  const st: GitStatus = { branch: null, upstream: null, ahead: 0, behind: 0, dirty: false };
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    if (line.startsWith("# branch.head ")) {
      const h = line.slice("# branch.head ".length);
      st.branch = h === "(detached)" ? null : h;
    } else if (line.startsWith("# branch.upstream ")) {
      st.upstream = line.slice("# branch.upstream ".length);
    } else if (line.startsWith("# branch.ab ")) {
      const m = /\+(\d+) -(\d+)/.exec(line);
      if (m) { st.ahead = Number(m[1]); st.behind = Number(m[2]); }
    } else if (!line.startsWith("#")) {
      st.dirty = true;
    }
  }
  return st;
}

export function parseWorktreeList(text: string): WorktreeEntry[] {
  const out: WorktreeEntry[] = [];
  text.split(/\r?\n\r?\n/).forEach((block, index) => {
    const lines = block.split(/\r?\n/).filter(Boolean);
    const wt = lines.find((l) => l.startsWith("worktree "));
    if (!wt || lines.includes("bare")) return;
    const branch = lines.find((l) => l.startsWith("branch "))?.slice("branch ".length) ?? null;
    out.push({
      path: wt.slice("worktree ".length),
      head: lines.find((l) => l.startsWith("HEAD "))?.slice("HEAD ".length) ?? "",
      branch: branch ? branch.replace(/^refs\/heads\//, "") : null,
      prunable: lines.some((l) => l === "prunable" || l.startsWith("prunable ")),
      isMain: index === 0,
    });
  });
  return out;
}

export function parseGitHubRemote(url: string): GitHubRepo | null {
  const m = /^(?:https?:\/\/(?:[^@/]+@)?github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(url.trim());
  return m ? { owner: m[1], name: m[2] } : null;
}

export function parseRevParse(text: string): { top: string; commonDir: string } | null {
  const [top, commonDir] = text.split(/\r?\n/).filter(Boolean);
  return top && commonDir ? { top, commonDir } : null;
}

export function repoRootFromCommonDir(commonDir: string): string {
  return commonDir.replace(/[\\/]\.git[\\/]?$/, "");
}
