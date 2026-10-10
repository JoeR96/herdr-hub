import { run } from "./exec.ts";

// No shell: URLs with & or ? must reach the opener unchanged.
export function openerCommand(target: string, platform: string = process.platform): [string, string[]] {
  if (platform === "win32") return ["rundll32", ["url.dll,FileProtocolHandler", target]];
  if (platform === "darwin") return ["open", [target]];
  return ["xdg-open", [target]];
}

// Links from GitHub (deployment URLs especially) are free text. On Windows the opener would also launch
// a file or a \\server\share program, so anything that isn't a plain web link is refused.
export function isWebUrl(s: string): boolean {
  return /^https?:\/\/[^\s]+$/i.test(s);
}

export async function openUrl(url: string): Promise<boolean> {
  return isWebUrl(url) ? openTarget(url) : false;
}

export async function openTarget(target: string): Promise<boolean> {
  const [cmd, args] = openerCommand(target);
  return (await run(cmd, args)).code === 0;
}
