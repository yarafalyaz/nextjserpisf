import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  create: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    systemSetting: { findFirst: mocks.findFirst, create: mocks.create },
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
      expect(mocks.create).not.toHaveBeenCalled();
    });

    it("creates default settings when none exist", async () => {
      mocks.findFirst.mockResolvedValue(null);
      const created = { id: 1, companyName: "Yara ERP" };
      mocks.create.mockResolvedValue(created);

      const result = await getSystemSettings();

      expect(result).toBe(created);
      expect(mocks.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
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
