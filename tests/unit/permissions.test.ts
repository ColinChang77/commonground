import { describe, expect, it } from "vitest";
import { can, canAssignRole } from "@/lib/permissions";

describe("project permission matrix", () => {
  it("anonymous / non-members can only view public projects", () => {
    expect(can(null, "project.view", "public")).toBe(true);
    expect(can(null, "project.view", "private")).toBe(false);
    for (const a of ["project.edit", "task.create", "task.work", "contribution.verify", "repo.manage", "agent.use", "approval.decide"] as const) {
      expect(can(null, a, "public")).toBe(false);
    }
  });
  it("viewers cannot create or verify work", () => {
    expect(can("viewer", "project.view", "private")).toBe(true);
    expect(can("viewer", "task.create", "private")).toBe(false);
    expect(can("viewer", "contribution.verify", "private")).toBe(false);
    expect(can("viewer", "agent.use", "private")).toBe(false);
  });
  it("contributors can work tasks but not verify, review or manage repos", () => {
    expect(can("contributor", "task.work", "public")).toBe(true);
    expect(can("contributor", "task.create", "public")).toBe(true);
    expect(can("contributor", "contribution.verify", "public")).toBe(false);
    expect(can("contributor", "application.review", "public")).toBe(false);
    expect(can("contributor", "repo.manage", "public")).toBe(false);
    expect(can("contributor", "approval.decide", "public")).toBe(false);
    expect(can("contributor", "deploy.production", "public")).toBe(false);
  });
  it("admins can manage but not delete or transfer", () => {
    expect(can("admin", "members.manage", "public")).toBe(true);
    expect(can("admin", "contribution.verify", "public")).toBe(true);
    expect(can("admin", "project.delete", "public")).toBe(false);
    expect(can("admin", "project.transfer", "public")).toBe(false);
    expect(can("admin", "members.setAdmin", "public")).toBe(false);
  });
  it("owners can do everything", () => {
    expect(can("owner", "project.delete", "private")).toBe(true);
    expect(can("owner", "deploy.production", "private")).toBe(true);
  });
  it("role assignment never escalates", () => {
    expect(canAssignRole("owner", "admin", "contributor")).toBe(true);
    expect(canAssignRole("owner", "owner", "admin")).toBe(false);
    expect(canAssignRole("admin", "admin", "contributor")).toBe(false);
    expect(canAssignRole("admin", "viewer", "admin")).toBe(false);
    expect(canAssignRole("admin", "viewer", "contributor")).toBe(true);
    expect(canAssignRole("contributor", "viewer", "viewer")).toBe(false);
    expect(canAssignRole("owner", "viewer", "owner")).toBe(false);
  });
});
