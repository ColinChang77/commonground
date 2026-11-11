export type BuildStage = "requested" | "building" | "review" | "live" | "cancelled";

export const BUILD_STAGES: { id: Exclude<BuildStage, "cancelled">; label: string; hint: string }[] = [
  { id: "requested", label: "Requested", hint: "Waiting for a builder" },
  { id: "building", label: "Being built", hint: "Someone is working on it" },
  { id: "review", label: "Your review", hint: "Check it and approve" },
  { id: "live", label: "Live", hint: "Done and online" },
];

export const BUILD_KINDS = [
  { id: "landing", label: "Landing page", emoji: "🏠", example: "A simple page that explains what our project is, with photos and a way to contact us." },
  { id: "form", label: "Sign-up form", emoji: "📝", example: "A form where people can sign up to volunteer, and we get their name, email and which days they're free." },
  { id: "booking", label: "Booking / reservations", emoji: "📅", example: "A page where people can see what's available and reserve it for a date." },
  { id: "store", label: "Small online shop", emoji: "🛍️", example: "A page to sell a few items, with photos, prices and a way to pay." },
  { id: "other", label: "Something else", emoji: "✨", example: "" },
] as const;

/** Community requests follow their linked to-do; team requests store their own status. */
export function buildStage(req: { builder: string; status: string }, task: { status: string; assigneeId: string | null } | null): BuildStage {
  if (req.status === "cancelled") return "cancelled";
  if (req.builder === "team") return req.status as BuildStage;
  if (!task) return "requested";
  if (task.status === "done") return "live";
  if (task.status === "in_review") return "review";
  if (task.status === "in_progress" || task.assigneeId) return "building";
  return "requested";
}
