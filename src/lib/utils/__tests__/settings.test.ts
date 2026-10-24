import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  create: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    systemSetting: { findFirst: mocks.findFirst, create: mocks.create, upsert: mocks.upsert },
  },
}));

// React's cache() wraps the fn; in tests we want a pass-through so each call
// actually hits our mocked prisma.
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return { ...actual, cache: (fn: unknown) => fn };
});

import { getSystemSettings, getSettingValue } from "@/lib/utils/settings";

describe("utils/settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getSystemSettings", () => {
    it("returns existing settings when present", async () => {
      const existing = { id: 1, companyName: "PT ABC", currencyCode: "IDR" };
      mocks.findFirst.mockResolvedValue(existing);

      const result = await getSystemSettings();

      expect(result).toBe(existing);
      expect(mocks.upsert).not.toHaveBeenCalled();
    });

    it("creates default settings when none exist (upsert on the singleton id)", async () => {
      mocks.findFirst.mockResolvedValue(null);
      const created = { id: 1, companyName: "Yara ERP" };
      mocks.upsert.mockResolvedValue(created);

      const result = await getSystemSettings();

      expect(result).toBe(created);
      // Upsert on id = 1 so two parallel renders cannot insert duplicate rows.
      expect(mocks.upsert).toHaveBeenCalledWith({
        where: { id: 1 },
        update: {},
        create: expect.objectContaining({
          id: 1,
          companyName: "Yara ERP",
          costingMethod: "FIFO",
          currencyCode: "IDR",
          itemCodePrefix: "ITM-",
          salesInvoicePrefix: "INV",
          latePenaltyPerMinute: 5000,
          maxLatePenaltyMinutes: 120,
        }),
      });
    });

  it("throws on schema drift (P2022) instead of silently serving defaults", async () => {
      const drift = Object.assign(
        new Error("The column `system_settings.late_fee_income_account_id` does not exist in the current database."),
        { code: "P2022" },
      );
      mocks.findFirst.mockRejectedValue(drift);
      vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(getSystemSettings()).rejects.toBe(drift);
    });

  it("throws on schema drift detected by message without a Prisma code", async () => {
      mocks.findFirst.mockRejectedValue(
        new Error("The table `system_settings` does not exist in the current database."),
      );
      vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(getSystemSettings()).rejects.toThrow(/does not exist in the current database/);
    });

  it("still falls back to memory defaults on transient DB errors", async () => {
      mocks.findFirst.mockRejectedValue(Object.assign(new Error("Can't reach database server"), { code: "P1001" }));
      vi.spyOn(console, "warn").mockImplementation(() => {});

      const result = await getSystemSettings();

      expect(result.companyName).toBe("Yara ERP");
      expect(result.costingMethod).toBe("FIFO");
    });
  });

  describe("getSettingValue", () => {
    it("returns the value for a given key", async () => {
      mocks.findFirst.mockResolvedValue({ id: 1, companyName: "PT XYZ", currencyCode: "IDR" });

      const result = await getSettingValue("companyName");

      expect(result).toBe("PT XYZ");
    });

    it("returns null when value is null/undefined", async () => {
      mocks.findFirst.mockResolvedValue({ id: 1, companyName: null });

      const result = await getSettingValue("companyName");

      expect(result).toBeNull();
    });
  });
});
