import { readPublished, readStore, unpublishedCount } from "../../claude-evidence/lib/store.ts";

export interface EvidenceInfo { url: string | null; unpublished: number }

/** Evidence page state for a worktree folder; null when it has none or its files can't be read. */
export function readEvidence(folder: string): EvidenceInfo | null {
  try {
    const store = readStore(folder);
    if (!store) return null;
    const pub = readPublished(folder);
    return { url: pub?.url ?? null, unpublished: unpublishedCount(store, pub) };
  } catch {
    return null;
  }
}
