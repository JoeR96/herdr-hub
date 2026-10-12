import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normPath } from "./model/paths.ts";

// import.meta.main only exists from Node 24.2; this works on every Node 24.
export function isEntry(metaUrl: string): boolean {
  const started = process.argv[1];
  return !!started && normPath(resolve(started)) === normPath(fileURLToPath(metaUrl));
}
