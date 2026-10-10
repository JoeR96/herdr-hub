export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function initials(label: string): string {
  const s = label.split(/[^A-Za-z0-9]+/).filter(Boolean).map((w) => w[0]).join("").toLowerCase();
  return s || "wt";
}

// "stairs fix" -> feature/stairs-fix; "fix/stairs" keeps the typed branch.
export function planWorktree(typed: string, branchPrefix: string, spaceLabel: string): { branch: string; label: string; agentName: string } | null {
  const label = typed.trim();
  if (!label) return null;
  const hasSlash = label.includes("/");
  const slug = slugify(hasSlash ? label.slice(label.lastIndexOf("/") + 1) : label);
  if (!slug) return null;
  const branch = hasSlash
    ? label.slice(0, label.lastIndexOf("/") + 1).toLowerCase().replace(/\s+/g, "-") + slug
    : branchPrefix + slug;
  let agentName = `${initials(spaceLabel)}-${slug}`;
  if (!/^[a-z]/.test(agentName)) agentName = `c-${agentName}`;
  agentName = agentName.slice(0, 32).replace(/-+$/, "");
  return { branch, label, agentName };
}
