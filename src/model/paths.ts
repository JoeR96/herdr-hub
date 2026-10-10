// herdr reports Windows paths with a \\?\ prefix; git reports C:/... with forward slashes.
export function cleanPath(p: string): string {
  return p.replace(/^\\\\\?\\/, "");
}

export function normPath(p: string, platform: string = process.platform): string {
  let s = cleanPath(p).replace(/\\/g, "/");
  while (s.length > 1 && s.endsWith("/") && !/^[A-Za-z]:\/$/.test(s)) s = s.slice(0, -1);
  return platform === "win32" ? s.toLowerCase() : s;
}

export function samePath(a: string, b: string, platform: string = process.platform): boolean {
  return normPath(a, platform) === normPath(b, platform);
}
