import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  executeRaw: vi.fn(),
  queryRaw: vi.fn(),
  findUnique: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        $executeRaw: mocks.executeRaw,
        $queryRaw: mocks.queryRaw,
      }),
    $executeRaw: mocks.executeRaw,
    documentSequence: {
      findUnique: mocks.findUnique,
      findMany: mocks.findMany,
    },
  },
}));

import { DocumentSequenceService } from "@/lib/services/document-sequence.service";

describe("DocumentSequenceService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("next", () => {
    it("returns sequence number from transaction", async () => {
      mocks.executeRaw.mockResolvedValue(1);
      mocks.queryRaw.mockResolvedValue([{ current_value: 5 }]);

      const result = await DocumentSequenceService.next("INV-2026-06");
      expect(result).toBe(5);
    });

    it("uses floor+1 as minimum value", async () => {
      mocks.executeRaw.mockResolvedValue(1);
      mocks.queryRaw.mockResolvedValue([{ current_value: 10 }]);

      const result = await DocumentSequenceService.next("INV-2026-06", 9);
      expect(result).toBe(10);
    });

    it("throws when query returns empty array", async () => {
      mocks.executeRaw.mockResolvedValue(1);
      mocks.queryRaw.mockResolvedValue([]);

      await expect(DocumentSequenceService.next("BAD-KEY")).rejects.toThrow(
        "Failed to retrieve sequence for key: BAD-KEY"
      );
    });

    it("throws when query returns null", async () => {
      mocks.executeRaw.mockResolvedValue(1);
      mocks.queryRaw.mockResolvedValue(null);

      await expect(DocumentSequenceService.next("NULL-KEY")).rejects.toThrow(
        "Failed to retrieve sequence for key: NULL-KEY"
      );
    });

    it("floor defaults to 0 (minimum returned is 1)", async () => {
      mocks.executeRaw.mockResolvedValue(1);
      mocks.queryRaw.mockResolvedValue([{ current_value: 1 }]);

      const result = await DocumentSequenceService.next("TEST");
      expect(result).toBe(1);
    });

    it("handles negative floor gracefully", async () => {
      mocks.executeRaw.mockResolvedValue(1);
      mocks.queryRaw.mockResolvedValue([{ current_value: 1 }]);

      const result = await DocumentSequenceService.next("TEST", -10);
      expect(result).toBe(1);
    });
  });

  describe("nextBatch", () => {
    it("returns empty array when count is <= 0", async () => {
      const result = await DocumentSequenceService.nextBatch("TEST", 0);
      expect(result).toEqual([]);
    });

    it("falls back to next when count is 1", async () => {
      mocks.executeRaw.mockResolvedValue(1);
      mocks.queryRaw.mockResolvedValue([{ current_value: 15 }]);

      const result = await DocumentSequenceService.nextBatch("TEST", 1, 10);
      expect(result).toEqual([15]);
      expect(mocks.queryRaw).toHaveBeenCalled();
    });

    it("returns contiguous block of numbers when count > 1", async () => {
      mocks.executeRaw.mockResolvedValue(1);
      // Simulating what DB would return for 'end' after an insert where GREATEST resolves to 10
      mocks.queryRaw.mockResolvedValue([{ current_value: 10 }]);

      const result = await DocumentSequenceService.nextBatch("TEST", 3, 5);
      expect(result).toEqual([8, 9, 10]);
    });
  });

  describe("peek", () => {
    it("returns current value when key exists", async () => {
      mocks.findUnique.mockResolvedValue({ key: "INV-2026-06", currentValue: 42 });

      const result = await DocumentSequenceService.peek("INV-2026-06");
      expect(result).toBe(42);
    });

    it("returns 0 when key does not exist", async () => {
      mocks.findUnique.mockResolvedValue(null);

      const result = await DocumentSequenceService.peek("NONEXIST");
      expect(result).toBe(0);
    });
  });

  describe("reset", () => {
    it("calls executeRaw with key and value", async () => {
      mocks.executeRaw.mockResolvedValue(1);

      await DocumentSequenceService.reset("INV-2026-06", 100);
      expect(mocks.executeRaw).toHaveBeenCalled();
    });

    it("defaults to 0 when value not provided", async () => {
      mocks.executeRaw.mockResolvedValue(1);

      await DocumentSequenceService.reset("INV-2026-06");
      expect(mocks.executeRaw).toHaveBeenCalled();
    });
  });

  describe("listByPrefix", () => {
    it("returns formatted list for matching keys", async () => {
      mocks.findMany.mockResolvedValue([
        { key: "INV-2026-01", currentValue: 15 },
        { key: "INV-2026-02", currentValue: 22 },
      ]);

      const result = await DocumentSequenceService.listByPrefix("INV-2026");
      expect(result).toEqual([
        { key: "INV-2026-01", currentValue: 15 },
        { key: "INV-2026-02", currentValue: 22 },
      ]);
    });

    it("returns empty array when no matches", async () => {
      mocks.findMany.mockResolvedValue([]);

      const result = await DocumentSequenceService.listByPrefix("NONE");
      expect(result).toEqual([]);
    });
  });
});
