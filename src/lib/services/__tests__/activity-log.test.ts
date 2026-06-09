import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  executeRaw: vi.fn(),
  queryRaw: vi.fn(),
  auth: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $executeRaw: mocks.executeRaw,
    $queryRaw: mocks.queryRaw,
  },
}));

vi.mock("@/lib/auth/auth", () => ({
  auth: mocks.auth,
}));

import { logActivity, getActivityLogs } from "@/lib/services/activity-log.service";

describe("activity-log.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("logActivity", () => {
    it("inserts activity log with authenticated user", async () => {
      mocks.auth.mockResolvedValue({ user: { id: "42" } });
      mocks.executeRaw.mockResolvedValue(1);

      await logActivity("create", "Invoice", 123, "Membuat faktur");

      expect(mocks.executeRaw).toHaveBeenCalled();
    });

    it("inserts with null userId when not authenticated", async () => {
      mocks.auth.mockResolvedValue(null);
      mocks.executeRaw.mockResolvedValue(1);

      await logActivity("update", "Item", 5);

      expect(mocks.executeRaw).toHaveBeenCalled();
    });

    it("does not throw when insert fails (silent catch)", async () => {
      mocks.auth.mockResolvedValue({ user: { id: "1" } });
      mocks.executeRaw.mockRejectedValue(new Error("DB down"));

      // Should not throw
      await expect(logActivity("delete", "Customer", 99)).resolves.toBeUndefined();
    });

    it("handles metadata serialization", async () => {
      mocks.auth.mockResolvedValue({ user: { id: "1" } });
      mocks.executeRaw.mockResolvedValue(1);

      await logActivity("update", "Settings", 1, "Updated", { field: "name", old: "A", new: "B" });

      expect(mocks.executeRaw).toHaveBeenCalled();
    });

    it("handles missing description and metadata", async () => {
      mocks.auth.mockResolvedValue({ user: { id: "1" } });
      mocks.executeRaw.mockResolvedValue(1);

      await logActivity("create", "Role", 10);

      expect(mocks.executeRaw).toHaveBeenCalled();
    });
  });

  describe("getActivityLogs", () => {
    it("queries with modelType and modelId filter", async () => {
      mocks.queryRaw.mockResolvedValue([{ id: 1, action: "create" }]);

      const result = await getActivityLogs("Invoice", 123);

      expect(mocks.queryRaw).toHaveBeenCalled();
      expect(result).toEqual([{ id: 1, action: "create" }]);
    });

    it("queries with modelType only", async () => {
      mocks.queryRaw.mockResolvedValue([]);

      const result = await getActivityLogs("Item");

      expect(mocks.queryRaw).toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it("queries without filters (all logs)", async () => {
      mocks.queryRaw.mockResolvedValue([{ id: 1 }, { id: 2 }]);

      const result = await getActivityLogs();

      expect(mocks.queryRaw).toHaveBeenCalled();
      expect(result).toHaveLength(2);
    });

    it("respects custom limit", async () => {
      mocks.queryRaw.mockResolvedValue([]);

      await getActivityLogs(undefined, undefined, 10);

      expect(mocks.queryRaw).toHaveBeenCalled();
    });
  });
});
