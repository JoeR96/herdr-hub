import { initialList, parseKeys, reduceList, renderList, renderMessage } from "./tty.ts";
import type { Item, Key, ListResult, ListState } from "./tty.ts";

export function screen(): { width: number; height: number } {
  return { width: process.stdout.columns || 80, height: process.stdout.rows || 24 };
}

export function readContext(): { workspace_id?: string; workspace_cwd?: string } {
  try { return JSON.parse(process.env.HERDR_PLUGIN_CONTEXT_JSON ?? "{}"); } catch { return {}; }
}

async function withKeys<T>(fn: (next: () => Promise<Key>) => Promise<T>): Promise<T> {
  const stdin = process.stdin;
  const queue: Key[] = [];
  let wake: (() => void) | null = null;
  const onData = (d: Buffer | string) => { queue.push(...parseKeys(d.toString())); wake?.(); };
  if (stdin.isTTY) stdin.setRawMode(true);
  stdin.setEncoding("utf8");
  stdin.on("data", onData);
  stdin.resume();
  process.stdout.write("\x1b[?25l");
  const next = async (): Promise<Key> => {
    while (!queue.length) await new Promise<void>((r) => { wake = r; });
    wake = null;
    return queue.shift()!;
  };
  try { return await fn(next); } finally {
    stdin.off("data", onData);
    if (stdin.isTTY) stdin.setRawMode(false);
    stdin.pause();
    process.stdout.write("\x1b[?25h");
  }
}

export function pickFromList(items: Item[], o: { title: string; intro?: string[]; footer: string; mode: "single" | "multi"; onChar?: (st: ListState, ch: string) => ListState }): Promise<ListResult> {
  return withKeys(async (next) => {
    let st = initialList(items);
    for (;;) {
      process.stdout.write(renderList(st, { ...o, ...screen() }));
      const key = await next();
      if (key.name === "char" && o.mode === "multi" && o.onChar) { st = o.onChar(st, key.ch!); continue; }
      const r = reduceList(st, key, o.mode);
      st = r.st;
      if (r.result) return r.result;
    }
  });
}

export function promptText(title: string, help: string): Promise<string | null> {
  return withKeys(async (next) => {
    let text = "";
    for (;;) {
      process.stdout.write(renderMessage(title, [help, "", `> ${text}█`], "enter to confirm · esc to cancel", screen()));
      const k = await next();
      if (k.name === "escape" || k.name === "ctrl-c") return null;
      if (k.name === "enter") return text;
      if (k.name === "backspace") text = text.slice(0, -1);
      else if (k.name === "space") text += " ";
      else if (k.name === "char") text += k.ch;
    }
  });
}

export function printScreen(title: string, lines: string[]): void {
  process.stdout.write(renderMessage(title, lines, "", screen()));
}

export async function showMessage(title: string, lines: string[]): Promise<void> {
  await withKeys(async (next) => {
    process.stdout.write(renderMessage(title, lines, "press any key", screen()));
    await next();
  });
}
