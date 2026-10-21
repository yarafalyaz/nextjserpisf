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

  describe("nominal opsional format Indonesia", () => {
    it("ongkir PO '2.000.000' tersimpan 2000000, kosong tetap undefined", () => {
      const r = purchaseOrderSchema.safeParse({ vendorId: 1, date: "2026-06-09", shippingCost: "2.000.000", serviceFee: "1.500.000,50" });
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.shippingCost).toBe(2_000_000);
        expect(r.data.serviceFee).toBe(1_500_000.5);
      }
      const kosong = purchaseOrderSchema.safeParse({ vendorId: 1, date: "2026-06-09" });
      expect(kosong.success).toBe(true);
      if (kosong.success) expect(kosong.data.shippingCost).toBeUndefined();
    });
    it("biaya GR dan potongan tagihan '2.000.000' terbaca penuh", () => {
      const gr = goodsReceiptSchema.safeParse({ purchaseOrderId: 1, warehouseId: 2, date: "2026-06-09", otherCost: "2.000.000", adminFee: "75.000" });
      expect(gr.success).toBe(true);
      if (gr.success) {
        expect(gr.data.otherCost).toBe(2_000_000);
        expect(gr.data.adminFee).toBe(75_000);
      }
      const bill = vendorBillSchema.safeParse({ vendorId: 1, date: "2026-06-09", withholdingAmount: "2.000.000" });
      expect(bill.success).toBe(true);
      if (bill.success) expect(bill.data.withholdingAmount).toBe(2_000_000);
    });
    it("admin fee pembayaran negatif ditolak", () => {
      const r = vendorPaymentSchema.safeParse({ vendorId: 1, amount: 1000, paymentDate: "2026-06-09", paymentMethod: "transfer", adminFee: "-5" });
      expect(r.success).toBe(false);
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
    it("menerima total format Indonesia (2.000.000 bukan 2)", () => {
      const r = vendorBillSchema.safeParse({ vendorId: 1, date: "2026-06-09", grandTotal: "2.000.000" });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.grandTotal).toBe(2_000_000);
    });
    it("accepts nomor faktur pajak opsional, menolak karakter liar", () => {
      const base = { vendorId: 1, date: "2026-06-09" };
      const ok = vendorBillSchema.safeParse({ ...base, taxInvoiceNumber: "010.000-26.87654321" });
      expect(ok.success).toBe(true);
      if (ok.success) expect(ok.data.taxInvoiceNumber).toBe("010.000-26.87654321");
      expect(vendorBillSchema.safeParse({ ...base, taxInvoiceNumber: "" }).success).toBe(true);
      expect(vendorBillSchema.safeParse({ ...base, taxInvoiceNumber: "010/000;DROP" }).success).toBe(false);
    });
  });

  describe("vendorPaymentSchema", () => {
    it("menerima nominal format Indonesia (2.000.000 bukan 2)", () => {
      const r = vendorPaymentSchema.safeParse({
        vendorId: 1, amount: "2.000.000", paymentDate: "2026-06-09", paymentMethod: "transfer",
      });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.amount).toBe(2_000_000);
    });
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
