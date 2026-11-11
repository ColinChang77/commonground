export const CATEGORIES = [
  { id: "technology", label: "Technology", emoji: "💻", blurb: "Apps, tools, hardware and anything built with code." },
  { id: "art", label: "Art", emoji: "🎨", blurb: "Illustration, photography, music, games and making things beautiful." },
  { id: "education", label: "Education", emoji: "🎓", blurb: "Teaching, learning, study groups and open resources." },
  { id: "business", label: "Business", emoji: "💼", blurb: "Startups, side projects, pitches and getting customers." },
  { id: "research", label: "Research", emoji: "🔬", blurb: "Questions, data, experiments and sharing what you found." },
  { id: "community", label: "Community", emoji: "🏘️", blurb: "Neighborhoods, clubs, volunteering and local projects." },
  { id: "social-impact", label: "Social Impact", emoji: "🌱", blurb: "Climate, equity, health and making things better for people." },
  { id: "events", label: "Events", emoji: "📅", blurb: "Meetups, workshops, walks and things happening soon." },
  { id: "lifestyle", label: "Lifestyle", emoji: "☕", blurb: "Habits, hobbies, food and everyday life." },
  { id: "other", label: "Other", emoji: "✳️", blurb: "Everything that doesn't fit anywhere else." },
] as const;
export type CategoryId = (typeof CATEGORIES)[number]["id"];
export const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as [CategoryId, ...CategoryId[]];
export const categoryLabel = (id: string) => CATEGORIES.find((c) => c.id === id)?.label ?? "Other";
export const category = (id: string) => CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];
/** Reddit-style community handle, e.g. c/SocialImpact */
export const communityName = (id: string) => `c/${categoryLabel(id).replace(/\s+/g, "")}`;

export const PROJECT_STATUSES = ["exploring", "recruiting", "building", "completed", "archived"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  exploring: "Exploring",
  recruiting: "Recruiting",
  building: "Building",
  completed: "Completed",
  archived: "Archived",
};

export const PROJECT_ROLES = ["owner", "admin", "contributor", "viewer"] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

export const COMPENSATION = [
  { id: "volunteer", label: "Volunteer" },
  { id: "credit", label: "Credit & portfolio" },
  { id: "paid", label: "Paid" },
  { id: "equity", label: "Equity" },
  { id: "revenue_share", label: "Revenue share" },
] as const;
export const COMPENSATION_IDS = COMPENSATION.map((c) => c.id) as [string, ...string[]];
export const compensationLabel = (id: string) => COMPENSATION.find((c) => c.id === id)?.label ?? id;

export const CONTRIBUTION_TYPES = [
  { id: "idea", label: "Ideas" },
  { id: "research", label: "Research" },
  { id: "design", label: "Design" },
  { id: "code", label: "Code" },
  { id: "testing", label: "Testing" },
  { id: "documentation", label: "Documentation" },
  { id: "community", label: "Community organization" },
] as const;
export const CONTRIBUTION_TYPE_IDS = CONTRIBUTION_TYPES.map((c) => c.id) as [string, ...string[]];
export const contributionTypeLabel = (id: string) => CONTRIBUTION_TYPES.find((c) => c.id === id)?.label ?? id;

export const AUTHORSHIP = [
  { id: "human", label: "Human-authored" },
  { id: "ai_assisted", label: "AI-assisted" },
  { id: "agent_generated", label: "Agent-generated" },
] as const;
export const AUTHORSHIP_IDS = ["human", "ai_assisted", "agent_generated"] as const;
export const authorshipLabel = (id: string) => AUTHORSHIP.find((c) => c.id === id)?.label ?? id;

export const TASK_STATUSES = ["todo", "in_progress", "in_review", "done"] as const;
export const TASK_STATUS_LABEL: Record<(typeof TASK_STATUSES)[number], string> = {
  todo: "To do",
  in_progress: "In progress",
  in_review: "In review",
  done: "Done",
};

export const REACTIONS = [
  { id: "spark", label: "Spark", hint: "Love this idea" },
  { id: "insight", label: "Insightful", hint: "Learned something" },
  { id: "helping", label: "I'd help", hint: "Interested in contributing" },
] as const;
export type ReactionKind = (typeof REACTIONS)[number]["id"];

export const OPEN_TO = [
  { id: "projects", label: "Joining projects" },
  { id: "volunteer", label: "Volunteer work" },
  { id: "paid", label: "Paid work" },
  { id: "mentoring", label: "Mentoring others" },
  { id: "learning", label: "Learning from others" },
] as const;

export const REPORT_REASONS = [
  { id: "spam", label: "Spam or scam" },
  { id: "harassment", label: "Harassment or hate" },
  { id: "misinformation", label: "Misleading information" },
  { id: "inappropriate", label: "Inappropriate content" },
  { id: "ip", label: "Intellectual property" },
  { id: "other", label: "Something else" },
] as const;
export const REPORT_REASON_IDS = REPORT_REASONS.map((r) => r.id) as [string, ...string[]];
