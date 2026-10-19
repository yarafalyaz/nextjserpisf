import { describe, it, expect } from "vitest";
import {
  purchaseRequestSchema,
  purchaseOrderSchema,
  goodsReceiptSchema,
  vendorBillSchema,
  vendorPaymentSchema,
  purchaseReturnSchema,
} from "@/lib/validations/purchase.schemas";
import { wibDateToUtcMidnight } from "@/lib/utils/attendance-time";

const BAD = "2026-02-30";

describe("purchase dateOnly", () => {
  it("rejects fictitious date on all purchase schemas", () => {
    expect(purchaseRequestSchema.safeParse({ date: BAD }).success).toBe(false);
    expect(purchaseOrderSchema.safeParse({ vendorId: 1, date: BAD }).success).toBe(false);
    expect(goodsReceiptSchema.safeParse({ purchaseOrderId: 1, warehouseId: 1, date: BAD }).success).toBe(false);
    expect(vendorBillSchema.safeParse({ vendorId: 1, date: BAD }).success).toBe(false);
    expect(vendorPaymentSchema.safeParse({ vendorId: 1, amount: 1, paymentDate: BAD, paymentMethod: "cash" }).success).toBe(false);
    expect(purchaseReturnSchema.safeParse({ purchaseOrderId: 1, date: BAD }).success).toBe(false);
  });
  it("rejects fictitious optional dates", () => {
    expect(purchaseOrderSchema.safeParse({ vendorId: 1, date: "2026-02-28", expectedDate: BAD }).success).toBe(false);
    expect(vendorBillSchema.safeParse({ vendorId: 1, date: "2026-02-28", dueDate: BAD }).success).toBe(false);
    expect(purchaseRequestSchema.safeParse({ date: "2026-02-28", requestDate: BAD }).success).toBe(false);
  });
  it("accepts valid dates and stores WIB date as UTC midnight", () => {
    expect(purchaseOrderSchema.safeParse({ vendorId: 1, date: "2026-02-28" }).success).toBe(true);
    expect(wibDateToUtcMidnight("2026-02-28").toISOString()).toBe("2026-02-28T00:00:00.000Z");
  });
});
