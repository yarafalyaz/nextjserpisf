import { describe, it, expect } from "vitest";
import {
  purchaseRequestSchema,
  purchaseOrderSchema,
  goodsReceiptSchema,
  vendorBillSchema,
  vendorPaymentSchema,
  purchaseReturnSchema,
} from "@/lib/validations/purchase.schemas";

describe("validations/purchase.schemas", () => {
  describe("purchaseRequestSchema", () => {
    it("accepts a valid request with required date", () => {
      expect(purchaseRequestSchema.safeParse({ date: "2026-06-09" }).success).toBe(true);
    });
    it("rejects empty date", () => {
      expect(purchaseRequestSchema.safeParse({ date: "" }).success).toBe(false);
    });
  });

  describe("purchaseOrderSchema", () => {
    it("accepts a valid PO", () => {
      expect(purchaseOrderSchema.safeParse({ vendorId: 1, date: "2026-06-09" }).success).toBe(true);
    });
    it("rejects missing vendorId", () => {
      const r = purchaseOrderSchema.safeParse({ date: "2026-06-09" });
      expect(r.success).toBe(false);
    });
    it("rejects vendorId of 0", () => {
      expect(purchaseOrderSchema.safeParse({ vendorId: 0, date: "2026-06-09" }).success).toBe(false);
    });
  });

  describe("goodsReceiptSchema", () => {
    it("accepts valid GR", () => {
      expect(goodsReceiptSchema.safeParse({ purchaseOrderId: 1, warehouseId: 2, date: "2026-06-09" }).success).toBe(true);
    });
    it("rejects missing warehouseId", () => {
      expect(goodsReceiptSchema.safeParse({ purchaseOrderId: 1, date: "2026-06-09" }).success).toBe(false);
    });
  });

  describe("vendorBillSchema", () => {
    it("accepts valid bill with defaults", () => {
      const r = vendorBillSchema.safeParse({ vendorId: 1, date: "2026-06-09" });
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.subtotal).toBe(0);
        expect(r.data.tax).toBe(0);
        expect(r.data.grandTotal).toBe(0);
      }
    });
    it("rejects negative subtotal", () => {
      expect(vendorBillSchema.safeParse({ vendorId: 1, date: "2026-06-09", subtotal: -10 }).success).toBe(false);
    });
  });

  describe("vendorPaymentSchema", () => {
    it("accepts valid payment", () => {
      const r = vendorPaymentSchema.safeParse({
        vendorId: 1, amount: 50000, paymentDate: "2026-06-09", paymentMethod: "transfer",
      });
      expect(r.success).toBe(true);
    });
    it("rejects amount of 0", () => {
      expect(vendorPaymentSchema.safeParse({
        vendorId: 1, amount: 0, paymentDate: "2026-06-09", paymentMethod: "cash",
      }).success).toBe(false);
    });
    it("rejects empty paymentMethod", () => {
      expect(vendorPaymentSchema.safeParse({
        vendorId: 1, amount: 100, paymentDate: "2026-06-09", paymentMethod: "",
      }).success).toBe(false);
    });
  });

  describe("purchaseReturnSchema", () => {
    it("accepts valid return", () => {
      expect(purchaseReturnSchema.safeParse({ purchaseOrderId: 1, date: "2026-06-09" }).success).toBe(true);
    });
    it("rejects missing purchaseOrderId", () => {
      expect(purchaseReturnSchema.safeParse({ date: "2026-06-09" }).success).toBe(false);
    });
  });
});
