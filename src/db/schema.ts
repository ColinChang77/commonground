/**
 * CommonGround database schema (Cloudflare D1 / SQLite, via Drizzle).
 *
 * Conventions
 * - ids are text (random UUIDs) unless an external id is the natural key.
 * - timestamps are integer milliseconds (`timestamp_ms`).
 * - enums are text columns validated in the app layer (zod) + CHECK constraints
 *   where the value set is stable.
 * - Authorization is enforced server-side in `src/lib/authz.ts` (D1 has no RLS);
 *   no table is ever exposed directly to the browser.
 */
import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/sqlite-core";

const id = () => text("id").primaryKey();
const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`);
const updatedAt = () =>
  integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`);

/* ------------------------------------------------------------------ */
/* Auth (Better Auth core tables — column names fixed by Better Auth)  */
/* ------------------------------------------------------------------ */

export const user = sqliteTable("user", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const session = sqliteTable(
  "session",
  {
    id: id(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: id(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
    scope: text("scope"),
    password: text("password"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = sqliteTable(
  "verification",
  {
    id: id(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

export const rateLimit = sqliteTable("rate_limit", {
  id: id(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: integer("last_request").notNull(),
});

/* ------------------------------------------------------------------ */
/* Profiles & social graph                                             */
/* ------------------------------------------------------------------ */

export const profiles = sqliteTable(
  "profiles",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    username: text("username").notNull(),
    displayName: text("display_name").notNull(),
    bio: text("bio").notNull().default(""),
    avatarKey: text("avatar_key"),
    /** json: { openTo: ("projects"|"mentoring"|"paid"|"volunteer")[], hoursPerWeek?: number, remote?: boolean } */
    collabPrefs: text("collab_prefs").notNull().default("{}"),
    platformRole: text("platform_role").notNull().default("member"),
    /** Sample content for demos — always labeled in the UI. */
    isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
    onboardedAt: integer("onboarded_at", { mode: "timestamp_ms" }),
    suspendedAt: integer("suspended_at", { mode: "timestamp_ms" }),
    suspendedReason: text("suspended_reason"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("profiles_username_uq").on(sql`lower(${t.username})`),
    check("profiles_role_ck", sql`${t.platformRole} in ('member','moderator','admin')`),
  ],
);

export const interests = sqliteTable(
  "user_interests",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.category] })],
);

export const skills = sqliteTable("skills", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
});

export const userSkills = sqliteTable(
  "user_skills",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    skillId: text("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.skillId] }), index("user_skills_skill_idx").on(t.skillId)],
);

export const follows = sqliteTable(
  "follows",
  {
    followerId: text("follower_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    followeeId: text("followee_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.followerId, t.followeeId] }), index("follows_followee_idx").on(t.followeeId)],
);

export const blocks = sqliteTable(
  "blocks",
  {
    blockerId: text("blocker_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    blockedId: text("blocked_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.blockerId, t.blockedId] })],
);

export const media = sqliteTable(
  "media",
  {
    id: id(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    key: text("key").notNull().unique(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("media_owner_idx").on(t.ownerId)],
);

/* ------------------------------------------------------------------ */
/* Projects                                                            */
/* ------------------------------------------------------------------ */

export const projects = sqliteTable(
  "projects",
  {
    id: id(),
    slug: text("slug").notNull().unique(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    description: text("description").notNull().default(""),
    /** json string[] */
    goals: text("goals").notNull().default("[]"),
    outcomes: text("outcomes").notNull().default(""),
    category: text("category").notNull(),
    status: text("status").notNull().default("exploring"),
    visibility: text("visibility").notNull().default("public"),
    /** When true, signed-in people can join as contributors in one click (no application). */
    openJoin: integer("open_join", { mode: "boolean" }).notNull().default(true),
    isSoftware: integer("is_software", { mode: "boolean" }).notNull().default(false),
    /** json { label: string, url: string }[] */
    links: text("links").notNull().default("[]"),
    /** json string[] */
    tags: text("tags").notNull().default("[]"),
    /** Monthly hosted-agent budget in US cents; 0 = hosted agents disabled. */
    agentBudgetCents: integer("agent_budget_cents").notNull().default(0),
    sourceDiscussionId: text("source_discussion_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("projects_owner_idx").on(t.ownerId),
    index("projects_status_idx").on(t.status, t.updatedAt),
    check("projects_status_ck", sql`${t.status} in ('exploring','recruiting','building','completed','archived')`),
    check("projects_visibility_ck", sql`${t.visibility} in ('public','private')`),
  ],
);

export const projectMembers = sqliteTable(
  "project_members",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    joinedAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.userId] }),
    index("project_members_user_idx").on(t.userId),
    check("project_members_role_ck", sql`${t.role} in ('owner','admin','contributor','viewer')`),
  ],
);

export const projectInvitations = sqliteTable(
  "project_invitations",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    inviteeId: text("invitee_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    invitedBy: text("invited_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("contributor"),
    status: text("status").notNull().default("pending"),
    createdAt: createdAt(),
  },
  (t) => [index("project_invitations_invitee_idx").on(t.inviteeId, t.status)],
);

/* ------------------------------------------------------------------ */
/* Discussions / feed                                                  */
/* ------------------------------------------------------------------ */

export const discussions = sqliteTable(
  "discussions",
  {
    id: id(),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** discussion | idea | update (project update mirrored into the feed) */
    kind: text("kind").notNull().default("discussion"),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    category: text("category").notNull(),
    imageKey: text("image_key"),
    /** Set when the discussion was posted inside a project workspace. */
    projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
    /** Set when the discussion was converted into a project. */
    convertedProjectId: text("converted_project_id").references(() => projects.id, { onDelete: "set null" }),
    status: text("status").notNull().default("published"),
    commentCount: integer("comment_count").notNull().default(0),
    /** upvotes − downvotes, recomputed from `votes` on every vote */
    score: integer("score").notNull().default(0),
    reactionCount: integer("reaction_count").notNull().default(0),
    lastActivityAt: integer("last_activity_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("discussions_feed_idx").on(t.status, t.createdAt),
    index("discussions_author_idx").on(t.authorId, t.createdAt),
    index("discussions_project_idx").on(t.projectId, t.createdAt),
    index("discussions_category_idx").on(t.category, t.createdAt),
    index("discussions_score_idx").on(t.status, t.score),
    check("discussions_kind_ck", sql`${t.kind} in ('discussion','idea','update')`),
    check("discussions_status_ck", sql`${t.status} in ('published','removed')`),
  ],
);

export const comments = sqliteTable(
  "comments",
  {
    id: id(),
    discussionId: text("discussion_id")
      .notNull()
      .references(() => discussions.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    parentId: text("parent_id"),
    body: text("body").notNull(),
    status: text("status").notNull().default("published"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("comments_discussion_idx").on(t.discussionId, t.createdAt), index("comments_parent_idx").on(t.parentId)],
);

export const reactions = sqliteTable(
  "reactions",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    kind: text("kind").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.targetType, t.targetId, t.kind] }),
    index("reactions_target_idx").on(t.targetType, t.targetId),
    check("reactions_kind_ck", sql`${t.kind} in ('spark','insight','helping')`),
  ],
);

export const votes = sqliteTable(
  "votes",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    discussionId: text("discussion_id")
      .notNull()
      .references(() => discussions.id, { onDelete: "cascade" }),
    value: integer("value").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.discussionId] }),
    index("votes_discussion_idx").on(t.discussionId),
    check("votes_value_ck", sql`${t.value} in (-1, 1)`),
  ],
);

export const bookmarks = sqliteTable(
  "bookmarks",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    discussionId: text("discussion_id")
      .notNull()
      .references(() => discussions.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.discussionId] })],
);

export const projectUpdates = sqliteTable(
  "project_updates",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    isMilestone: integer("is_milestone", { mode: "boolean" }).notNull().default(false),
    /** human | agent (drafted through MCP) */
    source: text("source").notNull().default("human"),
    status: text("status").notNull().default("published"),
    createdAt: createdAt(),
  },
  (t) => [index("project_updates_project_idx").on(t.projectId, t.createdAt)],
);

/* ------------------------------------------------------------------ */
/* Collaboration                                                       */
/* ------------------------------------------------------------------ */

export const opportunities = sqliteTable(
  "opportunities",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    deliverable: text("deliverable").notNull().default(""),
    commitment: text("commitment").notNull().default(""),
    compensation: text("compensation").notNull().default("volunteer"),
    deadline: integer("deadline", { mode: "timestamp_ms" }),
    status: text("status").notNull().default("open"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("opportunities_project_idx").on(t.projectId),
    index("opportunities_status_idx").on(t.status, t.createdAt),
    check("opportunities_status_ck", sql`${t.status} in ('open','closed','filled')`),
    check(
      "opportunities_comp_ck",
      sql`${t.compensation} in ('volunteer','paid','equity','revenue_share','credit')`,
    ),
  ],
);

export const opportunitySkills = sqliteTable(
  "opportunity_skills",
  {
    opportunityId: text("opportunity_id")
      .notNull()
      .references(() => opportunities.id, { onDelete: "cascade" }),
    skillId: text("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.opportunityId, t.skillId] }), index("opportunity_skills_skill_idx").on(t.skillId)],
);

export const applications = sqliteTable(
  "applications",
  {
    id: id(),
    opportunityId: text("opportunity_id")
      .notNull()
      .references(() => opportunities.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    applicantId: text("applicant_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    message: text("message").notNull().default(""),
    status: text("status").notNull().default("pending"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: integer("reviewed_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("applications_unique").on(t.opportunityId, t.applicantId),
    index("applications_applicant_idx").on(t.applicantId, t.createdAt),
    index("applications_project_idx").on(t.projectId, t.status),
    check("applications_status_ck", sql`${t.status} in ('pending','accepted','rejected','withdrawn')`),
  ],
);

export const tasks = sqliteTable(
  "tasks",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    deliverable: text("deliverable").notNull().default(""),
    status: text("status").notNull().default("todo"),
    contributionType: text("contribution_type").notNull().default("code"),
    isCoding: integer("is_coding", { mode: "boolean" }).notNull().default(false),
    assigneeId: text("assignee_id").references(() => user.id, { onDelete: "set null" }),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** web | mcp | github */
    createdVia: text("created_via").notNull().default("web"),
    dueAt: integer("due_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("tasks_project_idx").on(t.projectId, t.status),
    index("tasks_assignee_idx").on(t.assigneeId),
    check("tasks_status_ck", sql`${t.status} in ('todo','in_progress','in_review','done')`),
  ],
);

export const taskSubmissions = sqliteTable(
  "task_submissions",
  {
    id: id(),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    submitterId: text("submitter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    summary: text("summary").notNull(),
    link: text("link"),
    /** human | ai_assisted | agent_generated */
    authorship: text("authorship").notNull().default("human"),
    agentLabel: text("agent_label"),
    status: text("status").notNull().default("submitted"),
    reviewedBy: text("reviewed_by"),
    reviewNote: text("review_note"),
    reviewedAt: integer("reviewed_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("task_submissions_task_idx").on(t.taskId),
    check("task_submissions_status_ck", sql`${t.status} in ('submitted','approved','changes_requested')`),
    check("task_submissions_authorship_ck", sql`${t.authorship} in ('human','ai_assisted','agent_generated')`),
  ],
);

export const contributions = sqliteTable(
  "contributions",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    taskId: text("task_id").references(() => tasks.id, { onDelete: "set null" }),
    submissionId: text("submission_id").references(() => taskSubmissions.id, { onDelete: "set null" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    authorship: text("authorship").notNull().default("human"),
    agentLabel: text("agent_label"),
    pullRequestId: text("pull_request_id"),
    /** json string[] of commit SHAs */
    commitShas: text("commit_shas").notNull().default("[]"),
    status: text("status").notNull().default("pending"),
    verifiedBy: text("verified_by"),
    verifiedAt: integer("verified_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("contributions_user_idx").on(t.userId, t.status),
    index("contributions_project_idx").on(t.projectId, t.status),
    index("contributions_verified_idx").on(t.status, t.verifiedAt),
    check(
      "contributions_type_ck",
      sql`${t.type} in ('idea','research','design','code','testing','documentation','community')`,
    ),
    check("contributions_status_ck", sql`${t.status} in ('pending','verified','rejected')`),
  ],
);

export const contributionVerifications = sqliteTable(
  "contribution_verifications",
  {
    id: id(),
    contributionId: text("contribution_id")
      .notNull()
      .references(() => contributions.id, { onDelete: "cascade" }),
    actorId: text("actor_id").notNull(),
    action: text("action").notNull(),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("contribution_verifications_idx").on(t.contributionId)],
);

/** Human-readable project timeline ("Maya finished the poster"). Persisted + broadcast live. */
export const projectActivity = sqliteTable(
  "project_activity",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    actorId: text("actor_id"),
    /** joined | task_claimed | task_started | task_submitted | task_done | task_created | update | comment | agent | github | build | milestone */
    kind: text("kind").notNull(),
    message: text("message").notNull(),
    url: text("url"),
    taskId: text("task_id"),
    createdAt: createdAt(),
  },
  (t) => [index("project_activity_idx").on(t.projectId, t.createdAt)],
);

/* ------------------------------------------------------------------ */
/* Notifications, moderation, audit                                    */
/* ------------------------------------------------------------------ */

export const notifications = sqliteTable(
  "notifications",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    actorId: text("actor_id"),
    type: text("type").notNull(),
    projectId: text("project_id"),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    url: text("url").notNull(),
    readAt: integer("read_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.createdAt)],
);

export const reports = sqliteTable(
  "reports",
  {
    id: id(),
    reporterId: text("reporter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    reason: text("reason").notNull(),
    details: text("details").notNull().default(""),
    status: text("status").notNull().default("open"),
    resolvedBy: text("resolved_by"),
    resolvedAt: integer("resolved_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("reports_status_idx").on(t.status, t.createdAt),
    uniqueIndex("reports_once_uq").on(t.reporterId, t.targetType, t.targetId),
  ],
);

export const moderationActions = sqliteTable(
  "moderation_actions",
  {
    id: id(),
    moderatorId: text("moderator_id").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    action: text("action").notNull(),
    reason: text("reason").notNull().default(""),
    reportId: text("report_id"),
    createdAt: createdAt(),
  },
  (t) => [index("moderation_actions_target_idx").on(t.targetType, t.targetId)],
);

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: id(),
    actorId: text("actor_id"),
    /** web | mcp | github | system */
    via: text("via").notNull().default("web"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    projectId: text("project_id"),
    metadata: text("metadata").notNull().default("{}"),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_logs_project_idx").on(t.projectId, t.createdAt), index("audit_logs_actor_idx").on(t.actorId)],
);

export const appRateLimits = sqliteTable("app_rate_limits", {
  key: text("key").primaryKey(),
  windowStart: integer("window_start").notNull(),
  count: integer("count").notNull(),
});

export const analyticsEvents = sqliteTable(
  "analytics_events",
  {
    id: id(),
    userId: text("user_id"),
    name: text("name").notNull(),
    properties: text("properties").notNull().default("{}"),
    createdAt: createdAt(),
  },
  (t) => [index("analytics_events_name_idx").on(t.name, t.createdAt)],
);

/** Development-only email sink (never written when ENVIRONMENT=production). */
export const devOutbox = sqliteTable("dev_outbox", {
  id: id(),
  to: text("to").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  url: text("url"),
  createdAt: createdAt(),
});

/* ------------------------------------------------------------------ */
/* AI agents                                                           */
/* ------------------------------------------------------------------ */

export const agentProviders = sqliteTable("agent_providers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** hosted (API key, runs on CommonGround infra) | byo (connects via MCP) */
  kind: text("kind").notNull(),
  docsUrl: text("docs_url").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
});

export const userAgentConnections = sqliteTable(
  "user_agent_connections",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    providerId: text("provider_id")
      .notNull()
      .references(() => agentProviders.id),
    label: text("label").notNull().default(""),
    /** AES-256-GCM ciphertext (base64 iv.ciphertext). Never selected in client-facing queries. */
    encryptedSecret: text("encrypted_secret").notNull(),
    secretHint: text("secret_hint").notNull(),
    status: text("status").notNull().default("active"),
    lastValidatedAt: integer("last_validated_at", { mode: "timestamp_ms" }),
    lastError: text("last_error"),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [index("user_agent_connections_user_idx").on(t.userId)],
);

export const mcpTokens = sqliteTable(
  "mcp_tokens",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** SHA-256 hex of the token; the token itself is shown once and never stored. */
    tokenHash: text("token_hash").notNull().unique(),
    tokenPrefix: text("token_prefix").notNull(),
    /** json ("read"|"write")[] */
    scopes: text("scopes").notNull().default('["read"]'),
    /** json string[] of project ids, or null for "all projects I belong to" */
    projectIds: text("project_ids"),
    lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
    lastClient: text("last_client"),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [index("mcp_tokens_user_idx").on(t.userId)],
);

export const agentSessions = sqliteTable(
  "agent_sessions",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    providerId: text("provider_id").notNull(),
    mode: text("mode").notNull(),
    connectionId: text("connection_id"),
    mcpTokenId: text("mcp_token_id"),
    clientName: text("client_name"),
    status: text("status").notNull().default("active"),
    createdAt: createdAt(),
    lastEventAt: integer("last_event_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [index("agent_sessions_project_idx").on(t.projectId, t.lastEventAt)],
);

export const agentRuns = sqliteTable(
  "agent_runs",
  {
    id: id(),
    sessionId: text("session_id").references(() => agentSessions.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    taskId: text("task_id").references(() => tasks.id, { onDelete: "set null" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    providerId: text("provider_id").notNull(),
    model: text("model"),
    /** Human label of the agent, e.g. "Claude Code" (self-reported by the MCP client). */
    agentLabel: text("agent_label"),
    status: text("status").notNull().default("ready"),
    branch: text("branch"),
    prompt: text("prompt").notNull(),
    summary: text("summary"),
    budgetCents: integer("budget_cents").notNull().default(0),
    estCostCents: integer("est_cost_cents").notNull().default(0),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    durationMs: integer("duration_ms"),
    error: text("error"),
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("agent_runs_project_idx").on(t.projectId, t.createdAt),
    check(
      "agent_runs_status_ck",
      sql`${t.status} in ('ready','connecting','running','waiting_approval','testing','changes_ready','pr_created','failed','completed','cancelled','blocked')`,
    ),
  ],
);

export const agentRunEvents = sqliteTable(
  "agent_run_events",
  {
    id: id(),
    runId: text("run_id").references(() => agentRuns.id, { onDelete: "cascade" }),
    sessionId: text("session_id").references(() => agentSessions.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    message: text("message").notNull(),
    data: text("data").notNull().default("{}"),
    createdAt: createdAt(),
  },
  (t) => [index("agent_run_events_run_idx").on(t.runId, t.createdAt), index("agent_run_events_session_idx").on(t.sessionId, t.createdAt)],
);

export const agentApprovals = sqliteTable(
  "agent_approvals",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    runId: text("run_id"),
    sessionId: text("session_id"),
    requestedBy: text("requested_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** mcp | hosted */
    requestedVia: text("requested_via").notNull(),
    action: text("action").notNull(),
    summary: text("summary").notNull(),
    payload: text("payload").notNull().default("{}"),
    status: text("status").notNull().default("pending"),
    decidedBy: text("decided_by"),
    decidedAt: integer("decided_at", { mode: "timestamp_ms" }),
    resultRef: text("result_ref"),
    createdAt: createdAt(),
  },
  (t) => [
    index("agent_approvals_project_idx").on(t.projectId, t.status),
    check("agent_approvals_status_ck", sql`${t.status} in ('pending','approved','rejected')`),
  ],
);

export const agentUsageRecords = sqliteTable(
  "agent_usage_records",
  {
    id: id(),
    runId: text("run_id"),
    projectId: text("project_id").notNull(),
    userId: text("user_id").notNull(),
    providerId: text("provider_id").notNull(),
    model: text("model"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costCents: integer("cost_cents").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("agent_usage_project_idx").on(t.projectId, t.createdAt)],
);

/* ------------------------------------------------------------------ */
/* GitHub                                                              */
/* ------------------------------------------------------------------ */

export const githubInstallations = sqliteTable("github_installations", {
  /** GitHub installation id */
  id: text("id").primaryKey(),
  accountLogin: text("account_login").notNull(),
  accountType: text("account_type").notNull(),
  installedByUserId: text("installed_by_user_id").references(() => user.id, { onDelete: "set null" }),
  repositorySelection: text("repository_selection"),
  suspendedAt: integer("suspended_at", { mode: "timestamp_ms" }),
  deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const projectRepositories = sqliteTable(
  "project_repositories",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .unique()
      .references(() => projects.id, { onDelete: "cascade" }),
    installationId: text("installation_id")
      .notNull()
      .references(() => githubInstallations.id, { onDelete: "cascade" }),
    repoId: text("repo_id").notNull(),
    fullName: text("full_name").notNull(),
    defaultBranch: text("default_branch").notNull(),
    isPrivate: integer("is_private", { mode: "boolean" }).notNull(),
    linkedBy: text("linked_by").notNull(),
    lastPushAt: integer("last_push_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [index("project_repositories_repo_idx").on(t.repoId)],
);

export const githubIssues = sqliteTable(
  "github_issues",
  {
    id: id(),
    projectRepositoryId: text("project_repository_id")
      .notNull()
      .references(() => projectRepositories.id, { onDelete: "cascade" }),
    taskId: text("task_id").references(() => tasks.id, { onDelete: "set null" }),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    state: text("state").notNull(),
    htmlUrl: text("html_url").notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("github_issues_uq").on(t.projectRepositoryId, t.number), index("github_issues_task_idx").on(t.taskId)],
);

export const githubPullRequests = sqliteTable(
  "github_pull_requests",
  {
    id: id(),
    projectRepositoryId: text("project_repository_id")
      .notNull()
      .references(() => projectRepositories.id, { onDelete: "cascade" }),
    taskId: text("task_id").references(() => tasks.id, { onDelete: "set null" }),
    runId: text("run_id"),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    state: text("state").notNull(),
    headRef: text("head_ref").notNull(),
    baseRef: text("base_ref").notNull(),
    headSha: text("head_sha"),
    htmlUrl: text("html_url").notNull(),
    authorLogin: text("author_login"),
    mergedAt: integer("merged_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("github_prs_uq").on(t.projectRepositoryId, t.number),
    check("github_prs_state_ck", sql`${t.state} in ('open','closed','merged')`),
  ],
);

export const githubWebhookEvents = sqliteTable("github_webhook_events", {
  /** X-GitHub-Delivery — primary key gives idempotent processing. */
  deliveryId: text("delivery_id").primaryKey(),
  event: text("event").notNull(),
  action: text("action"),
  installationId: text("installation_id"),
  status: text("status").notNull(),
  error: text("error"),
  receivedAt: createdAt(),
});

/* ------------------------------------------------------------------ */
/* "Website & app" build requests (plain-language, non-technical)      */
/* ------------------------------------------------------------------ */

export const buildRequests = sqliteTable(
  "build_requests",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    requestedBy: text("requested_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    /** landing | form | booking | store | other */
    kind: text("kind").notNull().default("other"),
    /** community (volunteer via a to-do + Help wanted) | team (CommonGround builds it) */
    builder: text("builder").notNull(),
    /** Team requests only — community requests derive status from the linked to-do. */
    status: text("status").notNull().default("requested"),
    taskId: text("task_id").references(() => tasks.id, { onDelete: "set null" }),
    opportunityId: text("opportunity_id").references(() => opportunities.id, { onDelete: "set null" }),
    builtBy: text("built_by"),
    previewUrl: text("preview_url"),
    liveUrl: text("live_url"),
    note: text("note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("build_requests_project_idx").on(t.projectId, t.createdAt),
    index("build_requests_team_idx").on(t.builder, t.status),
    check("build_requests_builder_ck", sql`${t.builder} in ('community','team')`),
    check("build_requests_status_ck", sql`${t.status} in ('requested','building','review','live','cancelled')`),
  ],
);

/* ------------------------------------------------------------------ */
/* Deployments                                                         */
/* ------------------------------------------------------------------ */

export const projectDeployments = sqliteTable(
  "project_deployments",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** github (deployment API — covers Vercel, Cloudflare Pages, Netlify GitHub integrations) */
    provider: text("provider").notNull(),
    externalId: text("external_id").notNull(),
    environment: text("environment").notNull(),
    state: text("state").notNull(),
    url: text("url"),
    logUrl: text("log_url"),
    sha: text("sha"),
    ref: text("ref"),
    creator: text("creator"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("project_deployments_uq").on(t.provider, t.externalId),
    index("project_deployments_project_idx").on(t.projectId, t.createdAt),
  ],
);

export const deploymentEvents = sqliteTable(
  "deployment_events",
  {
    id: id(),
    deploymentId: text("deployment_id")
      .notNull()
      .references(() => projectDeployments.id, { onDelete: "cascade" }),
    state: text("state").notNull(),
    description: text("description"),
    createdAt: createdAt(),
  },
  (t) => [index("deployment_events_idx").on(t.deploymentId, t.createdAt)],
);
