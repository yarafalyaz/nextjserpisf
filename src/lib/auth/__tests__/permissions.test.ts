import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn() }));

vi.mock("@/lib/auth/auth", () => ({ auth: mocks.auth }));
// permissions.ts imports from "./auth"; that resolves to the same module above
// when the alias is configured, but be explicit by also mocking the relative path.
vi.mock("./auth", () => ({ auth: mocks.auth }));

import {
  requireAuth,
  requirePermission,
  requireRole,
  hasPermission,
} from "@/lib/auth/permissions";

describe("auth/permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("requireAuth", () => {
    it("returns user when authenticated and active", async () => {
      const user = { id: "1", roles: ["admin"], permissions: [], isActive: true };
      mocks.auth.mockResolvedValue({ user });

      expect(await requireAuth()).toBe(user);
    });

    it("throws when no session", async () => {
      mocks.auth.mockResolvedValue(null);
      await expect(requireAuth()).rejects.toThrow("Unauthorized");
    });

    it("throws when no user in session", async () => {
      mocks.auth.mockResolvedValue({});
      await expect(requireAuth()).rejects.toThrow("Unauthorized");
    });

    it("throws when user is inactive", async () => {
      mocks.auth.mockResolvedValue({ user: { id: "1", isActive: false, roles: [], permissions: [] } });
      await expect(requireAuth()).rejects.toThrow("Unauthorized");
    });
  });

  describe("requirePermission", () => {
    it("returns user when they have the permission", async () => {
      const user = { id: "1", roles: ["staff"], permissions: ["edit_items"], isActive: true };
      mocks.auth.mockResolvedValue({ user });

      expect(await requirePermission("edit_items")).toBe(user);
    });

    it("bypasses check for super_admin", async () => {
      const user = { id: "1", roles: ["super_admin"], permissions: [], isActive: true };
      mocks.auth.mockResolvedValue({ user });

      expect(await requirePermission("anything")).toBe(user);
    });

    it("throws when user lacks the permission", async () => {
      const user = { id: "1", roles: ["staff"], permissions: ["view_items"], isActive: true };
      mocks.auth.mockResolvedValue({ user });

      await expect(requirePermission("delete_items")).rejects.toThrow(
        "Forbidden: Anda tidak memiliki izin 'delete_items'"
      );
    });

    it("throws when unauthenticated", async () => {
      mocks.auth.mockResolvedValue(null);
      await expect(requirePermission("edit_items")).rejects.toThrow("Unauthorized");
    });
  });

  describe("requireRole", () => {
    it("returns user when they have the role", async () => {
      const user = { id: "1", roles: ["manager"], permissions: [], isActive: true };
      mocks.auth.mockResolvedValue({ user });

      expect(await requireRole("manager")).toBe(user);
    });

    it("bypasses check for super_admin", async () => {
      const user = { id: "1", roles: ["super_admin"], permissions: [], isActive: true };
      mocks.auth.mockResolvedValue({ user });

      expect(await requireRole("manager")).toBe(user);
    });

    it("throws when user lacks the role", async () => {
      const user = { id: "1", roles: ["staff"], permissions: [], isActive: true };
      mocks.auth.mockResolvedValue({ user });

      await expect(requireRole("manager")).rejects.toThrow(
        "Forbidden: Anda tidak memiliki role 'manager'"
      );
    });
  });

  describe("hasPermission", () => {
    it("returns true when user has the permission", async () => {
      mocks.auth.mockResolvedValue({
        user: { id: "1", roles: ["staff"], permissions: ["edit_items"], isActive: true },
      });

      expect(await hasPermission("edit_items")).toBe(true);
    });

    it("returns true for super_admin regardless of permission", async () => {
      mocks.auth.mockResolvedValue({
        user: { id: "1", roles: ["super_admin"], permissions: [], isActive: true },
      });

      expect(await hasPermission("anything")).toBe(true);
    });

    it("returns false when user lacks the permission", async () => {
      mocks.auth.mockResolvedValue({
        user: { id: "1", roles: ["staff"], permissions: ["view_items"], isActive: true },
      });

      expect(await hasPermission("delete_items")).toBe(false);
    });

    it("returns false when unauthenticated", async () => {
      mocks.auth.mockResolvedValue(null);
      expect(await hasPermission("edit_items")).toBe(false);
    });

    it("returns false when user is inactive", async () => {
      mocks.auth.mockResolvedValue({
        user: { id: "1", roles: ["super_admin"], permissions: [], isActive: false },
      });

      expect(await hasPermission("edit_items")).toBe(false);
    });

    it("returns false when permissions array is undefined", async () => {
      mocks.auth.mockResolvedValue({
        user: { id: "1", roles: ["staff"], isActive: true },
      });

      expect(await hasPermission("edit_items")).toBe(false);
    });
  });
});
