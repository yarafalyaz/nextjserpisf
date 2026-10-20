import { describe, it, expect } from "vitest";
import { recurringTransactionSchema } from "@/lib/validations/recurring.schemas";

describe("recurringTransactionSchema nominal", () => {
  it("menerima nominal format Indonesia (2.000.000 bukan 2)", () => {
    const r = recurringTransactionSchema.safeParse({
      name: "Sewa", type: "expense", frequency: "monthly", startDate: "2026-06-09", amount: "2.000.000",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.amount).toBe(2_000_000);
  });
  it("nominal kosong tetap 0 (jadwal tanpa nominal)", () => {
    const r = recurringTransactionSchema.safeParse({
      name: "Sewa", type: "expense", frequency: "monthly", startDate: "2026-06-09",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.amount).toBe(0);
  });
});
