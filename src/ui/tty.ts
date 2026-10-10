export type Key = { name: "up" | "down" | "enter" | "escape" | "space" | "backspace" | "tab" | "ctrl-c" | "char"; ch?: string };
export interface Item { id: string; label: string; section?: string; hint?: string; note?: string; disabled?: boolean }
export interface ListState { items: Item[]; cursor: number; filter: string; checked: Set<string> }
export type ListResult = { kind: "select"; id: string } | { kind: "done"; ids: string[] } | { kind: "cancel" };

export function parseKeys(s: string): Key[] {
  const out: Key[] = [];
  let i = 0;
  while (i < s.length) {
    const rest = s.slice(i);
    const arrow = /^\x1b(?:\[|O)([AB])/.exec(rest);
    if (arrow) { out.push({ name: arrow[1] === "A" ? "up" : "down" }); i += arrow[0].length; continue; }
    const other = /^\x1b(?:\[[0-9;?]*[A-Za-z~]|O[A-Za-z])/.exec(rest);
    if (other) { i += other[0].length; continue; }
    const c = s[i++];
    if (c === "\x1b") out.push({ name: "escape" });
    else if (c === "\r") { out.push({ name: "enter" }); if (s[i] === "\n") i++; }
    else if (c === "\n") out.push({ name: "enter" });
    else if (c === " ") out.push({ name: "space" });
    else if (c === "\x7f" || c === "\b") out.push({ name: "backspace" });
    else if (c === "\t") out.push({ name: "tab" });
    else if (c === "\x03") out.push({ name: "ctrl-c" });
    else if (c >= " ") out.push({ name: "char", ch: c });
  }
  return out;
}

export function initialList(items: Item[]): ListState {
  return { items, cursor: 0, filter: "", checked: new Set() };
}

export function visibleItems(st: ListState): Item[] {
  const f = st.filter.toLowerCase();
  return f ? st.items.filter((i) => i.label.toLowerCase().includes(f)) : st.items;
}

export function reduceList(st: ListState, key: Key, mode: "single" | "multi"): { st: ListState; result: ListResult | null } {
  const vis = visibleItems(st);
  const cur = vis[st.cursor];
  const same = { st, result: null };
  switch (key.name) {
    case "up": return { st: { ...st, cursor: Math.max(0, st.cursor - 1) }, result: null };
    case "down": return { st: { ...st, cursor: Math.min(Math.max(0, vis.length - 1), st.cursor + 1) }, result: null };
    case "escape": case "ctrl-c": return { st, result: { kind: "cancel" } };
    case "enter":
      if (mode === "multi") return { st, result: { kind: "done", ids: st.items.filter((i) => st.checked.has(i.id)).map((i) => i.id) } };
      return cur && !cur.disabled ? { st, result: { kind: "select", id: cur.id } } : same;
    case "space": {
      if (mode === "single") return { st: { ...st, filter: st.filter + " ", cursor: 0 }, result: null };
      if (!cur || cur.disabled) return same;
      const checked = new Set(st.checked);
      if (checked.has(cur.id)) checked.delete(cur.id); else checked.add(cur.id);
      return { st: { ...st, checked }, result: null };
    }
    case "backspace": return mode === "single" ? { st: { ...st, filter: st.filter.slice(0, -1), cursor: 0 }, result: null } : same;
    case "char": return mode === "single" ? { st: { ...st, filter: st.filter + key.ch, cursor: 0 }, result: null } : same;
    default: return same;
  }
}

const CSI = "\x1b[";
const bold = (s: string) => `${CSI}1m${s}${CSI}0m`;
const dim = (s: string) => `${CSI}2m${s}${CSI}0m`;
const CLEAR = `${CSI}2J${CSI}H`;

export function fit(s: string, w: number): string {
  const chars = [...s];
  return chars.length > w ? chars.slice(0, Math.max(0, w - 1)).join("") + "…" : s;
}

export function renderList(st: ListState, o: { title: string; intro?: string[]; footer: string; width: number; height: number; mode: "single" | "multi" }): string {
  const head = [bold(fit(o.title, o.width)), ...(o.intro ?? []).map((l) => fit(l, o.width))];
  if (st.filter) head.push(dim(fit(`filter: ${st.filter}`, o.width)));
  const body: string[] = [];
  let cursorLine = 0;
  let section: string | undefined;
  const vis = visibleItems(st);
  vis.forEach((it, idx) => {
    if (it.section && it.section !== section) { body.push(dim(fit(it.section.toUpperCase(), o.width))); section = it.section; }
    if (idx === st.cursor) cursorLine = body.length;
    const mark = o.mode === "multi" ? (it.disabled ? "[-] " : st.checked.has(it.id) ? "[x] " : "[ ] ") : "";
    const text = fit(`${idx === st.cursor ? "▸ " : "  "}${mark}${it.label}${it.hint ? "  " + it.hint : ""}`, o.width);
    body.push(it.disabled ? dim(text) : idx === st.cursor ? bold(text) : text);
    if (it.note) body.push(dim(fit(`      ${it.note}`, o.width)));
  });
  if (!vis.length) body.push(dim("  nothing matches"));
  const room = Math.max(1, o.height - head.length - 1);
  const start = Math.max(0, Math.min(cursorLine - room + 2, body.length - room));
  return CLEAR + [...head, ...body.slice(start, start + room)].join("\r\n") + "\r\n" + dim(fit(o.footer, o.width));
}

export function renderMessage(title: string, lines: string[], footer: string, size: { width: number; height: number }): string {
  const room = Math.max(1, size.height - 2);
  return CLEAR + [bold(fit(title, size.width)), ...lines.slice(0, room).map((l) => fit(l, size.width))].join("\r\n") + "\r\n" + dim(fit(footer, size.width));
}
