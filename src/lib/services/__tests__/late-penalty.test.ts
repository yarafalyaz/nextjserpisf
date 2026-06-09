import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock prisma
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    attendance: {
      findMany: vi.fn(),
    },
  },
}));

// Mock settings
vi.mock("@/lib/utils/settings", () => ({
  getSystemSettings: vi.fn(),
}));

import { calculateLatePenalty, getLatePenaltySummary } from "@/lib/services/late-penalty.service";
import { prisma } from "@/lib/db/prisma";
import { getSystemSettings } from "@/lib/utils/settings";

const mockFindMany = prisma.attendance.findMany as ReturnType<typeof vi.fn>;
const mockSettings = getSystemSettings as ReturnType<typeof vi.fn>;

describe("late-penalty.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSettings.mockResolvedValue({
      latePenaltyPerMinute: 500,
      maxLatePenaltyMinutes: 60,
    });
  });

  describe("calculateLatePenalty", () => {
    it("returns zero when no late attendances", async () => {
      mockFindMany.mockResolvedValue([]);

      const result = await calculateLatePenalty(1, new Date("2026-06-01"), new Date("2026-06-30"));

      expect(result.totalLateMinutes).toBe(0);
      expect(result.totalPenalty).toBe(0);
      expect(result.details).toHaveLength(0);
    });

    it("calculates penalty correctly for single late day", async () => {
      mockFindMany.mockResolvedValue([
        { date: new Date("2026-06-05"), lateMinutes: 15, checkIn: new Date("2026-06-05T08:15:00") },
      ]);

      const result = await calculateLatePenalty(1, new Date("2026-06-01"), new Date("2026-06-30"));

      expect(result.totalLateMinutes).toBe(15);
      expect(result.totalPenalty).toBe(15 * 500); // 7500
      expect(result.details).toHaveLength(1);
      expect(result.details[0].lateMinutes).toBe(15);
      expect(result.details[0].penalty).toBe(7500);
    });

    it("calculates penalty for multiple late days", async () => {
      mockFindMany.mockResolvedValue([
        { date: new Date("2026-06-05"), lateMinutes: 10, checkIn: new Date("2026-06-05T08:10:00") },
        { date: new Date("2026-06-07"), lateMinutes: 20, checkIn: new Date("2026-06-07T08:20:00") },
        { date: new Date("2026-06-10"), lateMinutes: 5, checkIn: new Date("2026-06-10T08:05:00") },
      ]);

      const result = await calculateLatePenalty(1, new Date("2026-06-01"), new Date("2026-06-30"));

      expect(result.totalLateMinutes).toBe(35);
      expect(result.totalPenalty).toBe(35 * 500); // 17500
      expect(result.details).toHaveLength(3);
    });

    it("caps late minutes at maxLatePenaltyMinutes", async () => {
      mockFindMany.mockResolvedValue([
        { date: new Date("2026-06-05"), lateMinutes: 120, checkIn: new Date("2026-06-05T10:00:00") },
      ]);

      const result = await calculateLatePenalty(1, new Date("2026-06-01"), new Date("2026-06-30"));

      // Should be capped at 60 (maxLatePenaltyMinutes)
      expect(result.totalLateMinutes).toBe(60);
      expect(result.totalPenalty).toBe(60 * 500); // 30000
      expect(result.details[0].lateMinutes).toBe(60);
    });

    it("skips records with lateMinutes <= 0", async () => {
      mockFindMany.mockResolvedValue([
        { date: new Date("2026-06-05"), lateMinutes: 0, checkIn: new Date("2026-06-05T08:00:00") },
        { date: new Date("2026-06-06"), lateMinutes: -5, checkIn: new Date("2026-06-06T07:55:00") },
        { date: new Date("2026-06-07"), lateMinutes: 10, checkIn: new Date("2026-06-07T08:10:00") },
      ]);

      const result = await calculateLatePenalty(1, new Date("2026-06-01"), new Date("2026-06-30"));

      expect(result.totalLateMinutes).toBe(10);
      expect(result.details).toHaveLength(1);
    });

    it("uses date as checkIn fallback when checkIn is null", async () => {
      const date = new Date("2026-06-05");
      mockFindMany.mockResolvedValue([
        { date, lateMinutes: 10, checkIn: null },
      ]);

      const result = await calculateLatePenalty(1, new Date("2026-06-01"), new Date("2026-06-30"));

      expect(result.details[0].actualCheckIn).toEqual(date);
    });

    it("uses correct penalty per minute from settings", async () => {
      mockSettings.mockResolvedValue({
        latePenaltyPerMinute: 1000,
        maxLatePenaltyMinutes: 30,
      });

      mockFindMany.mockResolvedValue([
        { date: new Date("2026-06-05"), lateMinutes: 20, checkIn: new Date("2026-06-05T08:20:00") },
      ]);

      const result = await calculateLatePenalty(1, new Date("2026-06-01"), new Date("2026-06-30"));

      expect(result.totalPenalty).toBe(20 * 1000); // 20000
    });
  });

  describe("getLatePenaltySummary", () => {
    it("returns summary with lateDays count", async () => {
      mockFindMany.mockResolvedValue([
        { date: new Date("2026-06-05"), lateMinutes: 10, checkIn: new Date("2026-06-05T08:10:00") },
        { date: new Date("2026-06-07"), lateMinutes: 15, checkIn: new Date("2026-06-07T08:15:00") },
      ]);

      const result = await getLatePenaltySummary(1, new Date("2026-06-01"), new Date("2026-06-30"));

      expect(result.lateDays).toBe(2);
      expect(result.totalLateMinutes).toBe(25);
      expect(result.totalPenalty).toBe(25 * 500);
      expect(result.details).toHaveLength(2);
    });

    it("returns zero summary when no late days", async () => {
      mockFindMany.mockResolvedValue([]);

      const result = await getLatePenaltySummary(1, new Date("2026-06-01"), new Date("2026-06-30"));

      expect(result.lateDays).toBe(0);
      expect(result.totalLateMinutes).toBe(0);
      expect(result.totalPenalty).toBe(0);
    });
  });
});
