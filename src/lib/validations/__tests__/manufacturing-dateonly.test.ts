import { describe, it, expect } from "vitest";
import {
  createProductionOrderSchema,
  updateProductionOrderSchema,
  createBomRevisionSchema,
  updateBomRevisionSchema,
} from "@/lib/validations/manufacturing.schemas";
import { wibDateToUtcMidnight } from "@/lib/utils/attendance-time";

describe("validations/manufacturing dateOnly jadwal produksi", () => {
  it("createProductionOrderSchema menolak startDate fiktif 2026-02-30", () => {
    expect(
      createProductionOrderSchema.safeParse({ productId: 1, qty: 1, startDate: "2026-02-30" }).success,
    ).toBe(false);
  });
  it("updateProductionOrderSchema menolak endDate fiktif 2026-02-30", () => {
    expect(
      updateProductionOrderSchema.safeParse({ productId: 1, qty: 1, endDate: "2026-02-30" }).success,
    ).toBe(false);
  });
  it("createBomRevisionSchema menolak effectiveDate fiktif 2026-02-30", () => {
    expect(createBomRevisionSchema.safeParse({ productId: 1, effectiveDate: "2026-02-30" }).success).toBe(
      false,
    );
  });
  it("updateBomRevisionSchema menolak effectiveDate bebas", () => {
    expect(updateBomRevisionSchema.safeParse({ effectiveDate: "besok" }).success).toBe(false);
  });
  it("tanggal sah tetap string dateOnly; konversi WIB tengah-malam UTC", () => {
    const r = createProductionOrderSchema.safeParse({
      productId: 1,
      qty: 1,
      startDate: "2026-10-20",
      endDate: "",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.startDate).toBe("2026-10-20");
      expect(r.data.endDate).toBeUndefined();
    }
    expect(wibDateToUtcMidnight("2026-10-20").toISOString()).toBe("2026-10-20T00:00:00.000Z");
  });
});
