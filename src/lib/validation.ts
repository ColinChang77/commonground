import { z } from "zod";
import { CATEGORY_IDS, COMPENSATION_IDS, CONTRIBUTION_TYPE_IDS, PROJECT_STATUSES, REPORT_REASON_IDS } from "@/lib/constants";

const trimmed = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .min(min, min <= 1 ? `${label} is required.` : `${label} needs at least ${min} characters.`)
    .max(max, `${label} can be at most ${max} characters.`);

export const usernameSchema = z
  .string()
  .trim()
  .min(3, "Usernames need at least 3 characters.")
  .max(30, "Usernames can be at most 30 characters.")
  .regex(/^[a-zA-Z0-9_]+$/, "Use letters, numbers and underscores only.")
  .refine((u) => !RESERVED_USERNAMES.has(u.toLowerCase()), "That username is reserved.");

export const RESERVED_USERNAMES = new Set([
  "admin", "administrator", "root", "support", "help", "api", "settings", "explore", "collaborate", "create",
  "activity", "profile", "commonground", "moderator", "staff", "system", "security", "null", "undefined", "me",
]);

export const profileSchema = z.object({
  username: usernameSchema,
  displayName: trimmed(1, 60, "Display name"),
  bio: z.string().trim().max(280, "Bios can be at most 280 characters.").default(""),
  interests: z.array(z.enum(CATEGORY_IDS)).max(10).default([]),
  skills: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  openTo: z.array(z.string().max(20)).max(6).default([]),
  hoursPerWeek: z.coerce.number().int().min(0).max(80).optional(),
  avatarKey: z.string().max(200).nullable().optional(),
});

export const discussionSchema = z.object({
  kind: z.enum(["discussion", "idea"]),
  title: trimmed(4, 140, "Title"),
  body: z.string().trim().max(20_000, "Posts can be at most 20,000 characters.").default(""),
  category: z.enum(CATEGORY_IDS),
  imageKey: z.string().max(200).nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
});

export const commentSchema = z.object({
  discussionId: z.string().uuid(),
  parentId: z.string().uuid().nullable().optional(),
  body: trimmed(1, 5000, "Comment"),
});

const goal = z.string().trim().min(1).max(200);
export const projectSchema = z.object({
  title: trimmed(4, 100, "Title"),
  summary: trimmed(10, 280, "Summary"),
  description: z.string().trim().max(20_000).default(""),
  goals: z.array(goal).min(1, "Add at least one goal.").max(8),
  outcomes: z.string().trim().max(2000).default(""),
  category: z.enum(CATEGORY_IDS),
  visibility: z.enum(["public", "private"]),
  isSoftware: z.boolean().default(false),
  tags: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
  neededRoles: z
    .array(z.object({ title: trimmed(3, 80, "Role title"), skills: z.array(z.string().trim().min(1).max(40)).max(8).default([]) }))
    .max(6)
    .default([]),
  sourceDiscussionId: z.string().uuid().nullable().optional(),
});

export const projectSettingsSchema = z.object({
  projectId: z.string().uuid(),
  title: trimmed(4, 100, "Title"),
  summary: trimmed(10, 280, "Summary"),
  description: z.string().trim().max(20_000).default(""),
  goals: z.array(goal).min(1).max(8),
  outcomes: z.string().trim().max(2000).default(""),
  category: z.enum(CATEGORY_IDS),
  status: z.enum(PROJECT_STATUSES),
  visibility: z.enum(["public", "private"]),
  isSoftware: z.boolean(),
  openJoin: z.boolean().default(true),
  tags: z.array(z.string().trim().min(1).max(30)).max(10),
  links: z.array(z.object({ label: trimmed(1, 40, "Link label"), url: z.string().url().max(500).refine((u) => /^https?:/.test(u), "Links must start with http(s)") })).max(8),
});

export const opportunitySchema = z.object({
  projectId: z.string().uuid(),
  title: trimmed(4, 100, "Title"),
  description: trimmed(10, 5000, "Description"),
  deliverable: z.string().trim().max(1000).default(""),
  commitment: z.string().trim().max(100).default(""),
  compensation: z.enum(COMPENSATION_IDS),
  deadline: z.string().optional().transform((v, ctx) => {
    if (!v) return null;
    const d = new Date(`${v}T23:59:59Z`);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: "custom", message: "Invalid date" });
      return z.NEVER;
    }
    return d;
  }),
  skills: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
});

export const applicationSchema = z.object({
  opportunityId: z.string().uuid(),
  message: trimmed(20, 3000, "Your message"),
});

export const taskSchema = z.object({
  projectId: z.string().uuid(),
  title: trimmed(3, 140, "Title"),
  description: z.string().trim().max(10_000).default(""),
  deliverable: z.string().trim().max(1000).default(""),
  contributionType: z.enum(CONTRIBUTION_TYPE_IDS),
  isCoding: z.boolean().default(false),
  assigneeId: z.string().uuid().nullable().optional(),
  dueAt: z.string().optional(),
});

export const submissionSchema = z.object({
  taskId: z.string().uuid(),
  summary: trimmed(10, 5000, "Summary"),
  link: z.string().trim().url().max(500).refine((u) => /^https?:/.test(u), "Links must start with http(s)").optional().or(z.literal("")),
  authorship: z.enum(["human", "ai_assisted", "agent_generated"]),
  agentLabel: z.string().trim().max(60).optional(),
});

export const updateSchema = z.object({
  projectId: z.string().uuid(),
  title: trimmed(4, 140, "Title"),
  body: z.string().trim().max(10_000).default(""),
  isMilestone: z.boolean().default(false),
  shareToFeed: z.boolean().default(true),
});

export const reportSchema = z.object({
  targetType: z.enum(["discussion", "comment", "project", "user", "opportunity"]),
  targetId: z.string().min(1).max(64),
  reason: z.enum(REPORT_REASON_IDS),
  details: z.string().trim().max(1000).default(""),
});

export function parseList(raw: FormDataEntryValue | null, max = 20): string[] {
  if (typeof raw !== "string") return [];
  return [...new Set(raw.split(/[,\n]/).map((s) => s.trim()).filter(Boolean))].slice(0, max);
}
