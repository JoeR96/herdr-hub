export function age(fromMs: number, nowMs: number): string {
  const s = Math.max(0, Math.round((nowMs - fromMs) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 14) return `${d}d ago`;
  return `${Math.floor(d / 7)}w ago`;
}

// East Asian wide and emoji blocks take two terminal cells (herdr measures with unicode-width).
const WIDE: [number, number][] = [
  [0x1100, 0x115f], [0x2e80, 0xa4cf], [0xac00, 0xd7a3], [0xf900, 0xfaff], [0xfe30, 0xfe4f],
  [0xff00, 0xff60], [0xffe0, 0xffe6], [0x1f300, 0x1faff], [0x20000, 0x3fffd],
];
const segmenter = new Intl.Segmenter();

function graphemeCells(g: string): number {
  const cp = g.codePointAt(0) ?? 0;
  if (g.includes("️") || WIDE.some(([a, b]) => cp >= a && cp <= b)) return 2;
  return 1;
}

/** Terminal cells a string takes, one grapheme at a time. */
export function cellWidth(s: string): number {
  let n = 0;
  for (const { segment } of segmenter.segment(s)) n += graphemeCells(segment);
  return n;
}

/** s cut to at most n cells, ending in … when shortened; never splits a grapheme. */
export function cutCells(s: string, n: number): string {
  if (cellWidth(s) <= n) return s;
  if (n <= 0) return "";
  let out = "", used = 0;
  for (const { segment } of segmenter.segment(s)) {
    const w = graphemeCells(segment);
    if (used + w > n - 1) break;
    out += segment;
    used += w;
  }
  return out + "…";
}
