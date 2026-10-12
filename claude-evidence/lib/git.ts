import { execFileSync } from "node:child_process";

export interface GitInfo { top: string; gitDir: string; commonDir: string; branch: string; linked: boolean }

function git(cwd: string, args: string[]): string {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] });
}

const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();

/** null when cwd is not inside a git work tree (or git is missing). */
export function gitInfo(cwd: string): GitInfo | null {
  try {
    const [top, gitDir, commonDir, branch] = git(cwd, ["rev-parse", "--path-format=absolute", "--show-toplevel", "--git-dir", "--git-common-dir", "--abbrev-ref", "HEAD"])
      .split(/\r?\n/);
    if (!top || !gitDir || !commonDir) return null;
    return { top, gitDir, commonDir, branch: branch || "HEAD", linked: norm(gitDir) !== norm(commonDir) };
  } catch {
    return null;
  }
}

export function headSummary(top: string): string {
  try { return git(top, ["log", "-1", "--format=%h %s"]).trim(); } catch { return ""; }
}
