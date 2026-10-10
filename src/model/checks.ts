export type CheckState = "success" | "failure" | "pending" | "none";

// GitHub's statusCheckRollup.state already combines every check on the commit.
export function rollupState(s?: string | null): CheckState {
  switch (s) {
    case "SUCCESS": return "success";
    case "FAILURE": case "ERROR": return "failure";
    case "PENDING": case "EXPECTED": return "pending";
    default: return "none";
  }
}

export function runState(status: string, conclusion: string | null): CheckState {
  if (status !== "completed") return "pending";
  if (conclusion === "success") return "success";
  if (["failure", "timed_out", "startup_failure", "action_required", "cancelled"].includes(conclusion ?? "")) return "failure";
  return "none";
}

export function deploymentState(s?: string | null): CheckState {
  switch (s) {
    case "SUCCESS": case "INACTIVE": return "success";
    case "FAILURE": case "ERROR": return "failure";
    case "IN_PROGRESS": case "QUEUED": case "PENDING": case "WAITING": return "pending";
    default: return "none";
  }
}

export function symbol(s: CheckState): string {
  return { success: "✓", failure: "✗", pending: "⋯", none: "" }[s];
}
