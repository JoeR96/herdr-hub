import { execFile } from "node:child_process";

export interface RunResult { code: number; stdout: string; stderr: string; missing: boolean }

// Runs a program with an argument array (never a shell). Never throws: failures come back in the result.
export function run(cmd: string, args: string[], opts: { cwd?: string; timeoutMs?: number } = {}): Promise<RunResult> {
  return new Promise((resolve) => {
    execFile(cmd, args, {
      cwd: opts.cwd,
      timeout: opts.timeoutMs ?? 30_000,
      maxBuffer: 32 * 1024 * 1024,
      windowsHide: true,
      encoding: "utf8",
    }, (err, stdout, stderr) => {
      const e = err as ({ code?: number | string; message?: string } | null);
      const missing = e?.code === "ENOENT";
      const code = e ? (typeof e.code === "number" ? e.code : 1) : 0;
      resolve({ code, stdout: stdout ?? "", stderr: stderr || (e?.message ?? ""), missing });
    });
  });
}
