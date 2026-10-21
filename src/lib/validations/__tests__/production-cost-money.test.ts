import { describe, it, expect } from "vitest";
import {
  createProductionCostSchema,
  updateProductionCostSchema,
  applyOverheadSchema,
} from "@/lib/validations/production-cost.schemas";

describe("production-cost nominal format Indonesia", () => {
  it("amount '2.000.000' terbaca 2000000 bukan 2 (HPP)", () => {
    const r = createProductionCostSchema.safeParse({
      category: "labor",
      amount: "2.000.000",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.amount).toBe(2_000_000);
  });
  it("rate '150.000,50' terbaca penuh di create dan update", () => {
    const c = createProductionCostSchema.safeParse({
      category: "machine",
      amount: "1.000.000",
      rate: "150.000,50",
    });
    expect(c.success).toBe(true);
    if (c.success) {
      expect(c.data.amount).toBe(1_000_000);
      expect(c.data.rate).toBe(150_000.5);
    }
    const u = updateProductionCostSchema.safeParse({
      category: "machine",
      amount: "2.500.000",
      rate: "150.000",
    });
    expect(u.success).toBe(true);
    if (u.success) {
      expect(u.data.amount).toBe(2_500_000);
      expect(u.data.rate).toBe(150_000);
    }
  });
  it("overhead rate '75.000' terbaca 75000", () => {
    const r = applyOverheadSchema.safeParse({
      productionOrderId: 1,
      driverType: "machine_hours",
      driverQty: "2",
      rate: "75.000",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.rate).toBe(75_000);
  });
  it("amount tak terbaca ditolak, bukan 0 diam-diam", () => {
    const r = createProductionCostSchema.safeParse({
      category: "labor",
      amount: "bukan-angka",
    });
    expect(r.success).toBe(false);
  });
});
