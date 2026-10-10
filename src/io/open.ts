import { run } from "./exec.ts";

// No shell: URLs with & or ? must reach the opener unchanged.
export function openerCommand(target: string, platform: string = process.platform): [string, string[]] {
  if (platform === "win32") return ["rundll32", ["url.dll,FileProtocolHandler", target]];
  if (platform === "darwin") return ["open", [target]];
  return ["xdg-open", [target]];
}

export async function openTarget(target: string): Promise<boolean> {
  const [cmd, args] = openerCommand(target);
  return (await run(cmd, args)).code === 0;
}
