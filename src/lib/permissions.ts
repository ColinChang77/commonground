/**
 * Pure permission matrix — the single source of truth for project roles.
 * Server code calls `can()` via `src/lib/authz.ts`; unit tests cover this table directly.
 */
import type { ProjectRole } from "@/lib/constants";

export type ProjectAction =
  | "project.view"
  | "project.edit"
  | "project.delete"
  | "project.transfer"
  | "members.manage"
  | "members.setAdmin"
  | "opportunity.manage"
  | "application.review"
  | "task.create"
  | "task.manage"
  | "task.work"
  | "contribution.verify"
  | "update.post"
  | "discussion.post"
  | "repo.manage"
  | "agent.use"
  | "approval.decide"
  | "deploy.production";

const MATRIX: Record<ProjectRole, ReadonlySet<ProjectAction>> = {
  owner: new Set<ProjectAction>([
    "project.view", "project.edit", "project.delete", "project.transfer", "members.manage", "members.setAdmin",
    "opportunity.manage", "application.review", "task.create", "task.manage", "task.work", "contribution.verify",
    "update.post", "discussion.post", "repo.manage", "agent.use", "approval.decide", "deploy.production",
  ]),
  admin: new Set<ProjectAction>([
    "project.view", "project.edit", "members.manage", "opportunity.manage", "application.review", "task.create",
    "task.manage", "task.work", "contribution.verify", "update.post", "discussion.post", "repo.manage", "agent.use",
    "approval.decide", "deploy.production",
  ]),
  contributor: new Set<ProjectAction>(["project.view", "task.create", "task.work", "discussion.post", "agent.use"]),
  viewer: new Set<ProjectAction>(["project.view", "discussion.post"]),
};

export type Visibility = "public" | "private";

/**
 * @param role the caller's membership role, or null for non-members / anonymous users.
 */
export function can(role: ProjectRole | null, action: ProjectAction, visibility: Visibility): boolean {
  if (!role) {
    // Non-members can only read public projects (and comment on public discussions via the feed rules).
    return action === "project.view" && visibility === "public";
  }
  return MATRIX[role].has(action);
}

/** Who may assign which role. Owners can grant admin; admins can only grant contributor/viewer. Nobody grants owner here. */
export function canAssignRole(actor: ProjectRole | null, target: ProjectRole, current: ProjectRole | null): boolean {
  if (!actor || target === "owner" || current === "owner") return false;
  if (actor === "owner") return true;
  if (actor === "admin") return (target === "contributor" || target === "viewer") && current !== "admin";
  return false;
}

export const ROLE_RANK: Record<ProjectRole, number> = { owner: 4, admin: 3, contributor: 2, viewer: 1 };

/* ---------------- Showcase threads (comment → change request) ---------------- */

/** Only the builder who owns a showcase post decides on change requests (adopt, decline, mark merged, rules). */
export function canDecideSuggestion(viewerId: string | null, builderId: string): boolean {
  return Boolean(viewerId) && viewerId === builderId;
}

/** Only the person who wrote the comment confirms the restated change request ("Yes, that's what I meant"). */
export function canConfirmSuggestion(viewerId: string | null, suggestionAuthorId: string): boolean {
  return Boolean(viewerId) && viewerId === suggestionAuthorId;
}

/** Points never go to the builder for their own showcase (no self-awarding). */
export function earnsPoints(recipientId: string, builderId: string): boolean {
  return recipientId !== builderId;
}
