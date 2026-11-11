/**
 * User-facing copy for showcase threads, kept in one place so it can be translated later.
 * Viewer copy never uses developer words (PR, branch, commit); builder copy may.
 */
export const VIEWER_STATUS: Record<string, string> = {
  confirming: "Is this what you meant?",
  queued: "Got it — your suggestion is in line",
  running: "An AI helper is making the change",
  reviewing: "A second AI is double-checking it",
  preview_ready: "Preview is ready",
  sent: "Sent to the maker",
  builder_review: "Waiting for the maker to decide",
  pr_opened: "The maker adopted your suggestion",
  merged: "Your suggestion is live",
  declined: "The maker decided not to use this one",
};

export const BUILDER_STATUS: Record<string, string> = {
  confirming: "Waiting for the commenter to confirm",
  queued: "Queued for the coding agent",
  running: "Coding agent running in sandbox",
  reviewing: "Review agent checking the diff",
  preview_ready: "Preview ready",
  sent: "Ready for your approval",
  builder_review: "Needs your decision (outside auto-PR rules)",
  pr_opened: "Pull request open",
  merged: "Merged",
  declined: "Declined",
};

export const STEP_ORDER = ["confirming", "queued", "running", "reviewing", "preview_ready", "sent", "pr_opened", "merged"] as const;

export const COPY = {
  aiName: "CommonGround AI",
  demoBadge: "Demo mode",
  demoExplainer: "Demo mode: the AI, sandbox and GitHub steps are labelled test doubles — nothing is sent to GitHub.",
  confirm: "Yes, that's what I meant",
  notQuite: "Not quite",
  adopt: "Approve & open PR",
  decline: "Decline",
  merge: "Mark merged (demo)",
  points: (n: number) => `${n} contribution point${n === 1 ? "" : "s"}`,
  showcase: "Showcase",
};
