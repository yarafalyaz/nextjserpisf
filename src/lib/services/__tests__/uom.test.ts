import { describe, it, expect, vi } from "vitest";
import { toBaseFactor, toBaseQty } from "@/lib/services/uom.service";
import type { Prisma } from "@prisma/client";

// Mock transaction client
function mockTx(opts: {
  item?: { unitOfMeasure: string } | null;
  conversion?: { factorToBase: number } | null;
}) {
  return {
    item: {
      findUnique: vi.fn().mockResolvedValue(opts.item ?? null),
    },
    uomConversion: {
      findUnique: vi.fn().mockResolvedValue(opts.conversion ?? null),
    },
  } as unknown as Prisma.TransactionClient;
}

describe("uom.service", () => {
  describe("toBaseFactor", () => {
    it("returns 1 when uom is null/undefined", async () => {
      const tx = mockTx({});
      expect(await toBaseFactor(tx, 1, null)).toBe(1);
      expect(await toBaseFactor(tx, 1, undefined)).toBe(1);
      expect(tx.item.findUnique).not.toHaveBeenCalled();
    });

    it("returns 1 when uom is empty string", async () => {
      const tx = mockTx({});
      expect(await toBaseFactor(tx, 1, "")).toBe(1);
    });

    it("returns 1 when uom matches item base unit", async () => {
      const tx = mockTx({ item: { unitOfMeasure: "PCS" } });
      expect(await toBaseFactor(tx, 1, "PCS")).toBe(1);
    });

    it("returns 1 when item not found", async () => {
      const tx = mockTx({ item: null });
      expect(await toBaseFactor(tx, 999, "BOX")).toBe(1);
    });

    it("returns conversion factor when alternate UoM found", async () => {
      const tx = mockTx({
        item: { unitOfMeasure: "PCS" },
        conversion: { factorToBase: 12 },
      });
      expect(await toBaseFactor(tx, 1, "BOX")).toBe(12);
    });

    it("returns 1 when no UoM conversion exists", async () => {
      const tx = mockTx({
        item: { unitOfMeasure: "PCS" },
        conversion: null,
      });
      expect(await toBaseFactor(tx, 1, "UNKNOWN")).toBe(1);
    });

    it("returns 1 when factorToBase is 0 or negative", async () => {
      const tx0 = mockTx({
        item: { unitOfMeasure: "PCS" },
        conversion: { factorToBase: 0 },
      });
      expect(await toBaseFactor(tx0, 1, "BOX")).toBe(1);

      const txNeg = mockTx({
        item: { unitOfMeasure: "PCS" },
        conversion: { factorToBase: -5 },
      });
      expect(await toBaseFactor(txNeg, 1, "BOX")).toBe(1);
    });

    it("handles decimal conversion factors", async () => {
      const tx = mockTx({
        item: { unitOfMeasure: "KG" },
        conversion: { factorToBase: 0.001 },
      });
      expect(await toBaseFactor(tx, 1, "GR")).toBeCloseTo(0.001);
    });
  });

  describe("toBaseQty", () => {
    it("multiplies qty by factor", async () => {
      const tx = mockTx({
        item: { unitOfMeasure: "PCS" },
        conversion: { factorToBase: 12 },
      });
      expect(await toBaseQty(tx, 1, "BOX", 3)).toBe(36);
    });

    it("returns qty unchanged when factor is 1 (base unit)", async () => {
      const tx = mockTx({ item: { unitOfMeasure: "PCS" } });
      expect(await toBaseQty(tx, 1, "PCS", 5)).toBe(5);
    });

    it("returns qty unchanged when uom is null", async () => {
      const tx = mockTx({});
      expect(await toBaseQty(tx, 1, null, 10)).toBe(10);
    });

    it("handles zero qty", async () => {
      const tx = mockTx({
        item: { unitOfMeasure: "PCS" },
        conversion: { factorToBase: 12 },
      });
      expect(await toBaseQty(tx, 1, "BOX", 0)).toBe(0);
    });
  });
});
