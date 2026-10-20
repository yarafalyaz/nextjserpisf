import { describe, it, expect } from "vitest";
import {
  createDownPaymentSchema,
  createSalesOrderSchema,
  createSalesInvoiceSchema,
  createSalesPaymentSchema,
  updateQuotationSchema,
} from "@/lib/validations/sales.schemas";

describe("validations/sales.schemas", () => {
  describe("createDownPaymentSchema", () => {
    it("accepts a valid down payment", () => {
      const result = createDownPaymentSchema.safeParse({
        quotationId: 5,
        amount: 1000000,
        paymentDate: "2026-06-09",
      });
      expect(result.success).toBe(true);
    });

    it("menerima nominal format Indonesia (2.000.000 bukan 2)", () => {
      const result = createDownPaymentSchema.safeParse({
        quotationId: 5,
        amount: "2.000.000",
        paymentDate: "2026-06-09",
      });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.amount).toBe(2_000_000);
    });

    it("rejects amount of 0", () => {
      const result = createDownPaymentSchema.safeParse({
        quotationId: 5,
        amount: 0,
        paymentDate: "2026-06-09",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.message.includes("lebih dari 0"))).toBe(true);
      }
    });

    it("rejects missing quotationId", () => {
      const result = createDownPaymentSchema.safeParse({ amount: 100, paymentDate: "2026-06-09" });
      expect(result.success).toBe(false);
    });

    it("rejects empty paymentDate", () => {
      const result = createDownPaymentSchema.safeParse({ quotationId: 5, amount: 100, paymentDate: "" });
      expect(result.success).toBe(false);
    });
  });

  describe("createSalesOrderSchema", () => {
    it("accepts a valid sales order", () => {
      const result = createSalesOrderSchema.safeParse({ customerId: 1, date: "2026-06-09" });
      expect(result.success).toBe(true);
    });

    it("rejects missing customerId", () => {
      expect(createSalesOrderSchema.safeParse({ date: "2026-06-09" }).success).toBe(false);
    });

    it("rejects empty date", () => {
      expect(createSalesOrderSchema.safeParse({ customerId: 1, date: "" }).success).toBe(false);
    });

    it("accepts optional quotationId and deliveryDate", () => {
      const result = createSalesOrderSchema.safeParse({
        customerId: 1, date: "2026-06-09", quotationId: 3, deliveryDate: "2026-06-15",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("createSalesInvoiceSchema", () => {
    it("accepts a valid invoice", () => {
      expect(createSalesInvoiceSchema.safeParse({ customerId: 1, date: "2026-06-09" }).success).toBe(true);
    });

    it("rejects missing customerId", () => {
      expect(createSalesInvoiceSchema.safeParse({ date: "2026-06-09" }).success).toBe(false);
    });

    it("accepts nomor faktur pajak opsional, menolak karakter liar", () => {
      const base = { customerId: 1, date: "2026-06-09" };
      expect(createSalesInvoiceSchema.safeParse(base).success).toBe(true);
      expect(createSalesInvoiceSchema.safeParse({ ...base, taxInvoiceNumber: "" }).success).toBe(true);
      const ok = createSalesInvoiceSchema.safeParse({ ...base, taxInvoiceNumber: "010.000-26.12345678" });
      expect(ok.success).toBe(true);
      if (ok.success) expect(ok.data.taxInvoiceNumber).toBe("010.000-26.12345678");
      expect(createSalesInvoiceSchema.safeParse({ ...base, taxInvoiceNumber: "010/000;DROP" }).success).toBe(false);
      expect(createSalesInvoiceSchema.safeParse({ ...base, taxInvoiceNumber: "0".repeat(51) }).success).toBe(false);
    });
  });

  describe("createSalesPaymentSchema", () => {
    it("accepts a valid payment", () => {
      const result = createSalesPaymentSchema.safeParse({
        salesInvoiceId: 1,
        amount: 500000,
        paymentDate: "2026-06-09",
        paymentMethod: "transfer",
      });
      expect(result.success).toBe(true);
    });

    it("menerima pembayaran format Indonesia beserta sen", () => {
      const result = createSalesPaymentSchema.safeParse({
        salesInvoiceId: 1, amount: "2.000.000,50", paymentDate: "2026-06-09", paymentMethod: "transfer",
      });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.amount).toBe(2_000_000.5);
    });

    it("rejects amount of 0", () => {
      const result = createSalesPaymentSchema.safeParse({
        salesInvoiceId: 1, amount: 0, paymentDate: "2026-06-09", paymentMethod: "cash",
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty paymentMethod", () => {
      const result = createSalesPaymentSchema.safeParse({
        salesInvoiceId: 1, amount: 100, paymentDate: "2026-06-09", paymentMethod: "",
      });
      expect(result.success).toBe(false);
    });

    it("menerima PPh yang dipotong pelanggan beserta bukti potongnya", () => {
      const result = createSalesPaymentSchema.safeParse({
        salesInvoiceId: 1,
        amount: 10_670_000,
        paymentDate: "2026-10-12",
        paymentMethod: "transfer",
        withholdingTypeId: "7",
        withholdingAmount: "330000",
        withholdingCertificateNo: "BP-2026-0001",
        withholdingDate: "2026-10-12",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        // Koersi: nilainya datang sebagai string dari FormData.
        expect(result.data.withholdingTypeId).toBe(7);
        expect(result.data.withholdingAmount).toBe(330_000);
      }
    });

    it("menolak potongan PPh negatif", () => {
      const result = createSalesPaymentSchema.safeParse({
        salesInvoiceId: 1,
        amount: 10_670_000,
        paymentDate: "2026-10-12",
        paymentMethod: "transfer",
        withholdingAmount: -1,
      });
      expect(result.success).toBe(false);
    });

    it("masih menerima pembayaran tanpa potongan PPh (kolom opsional)", () => {
      const result = createSalesPaymentSchema.safeParse({
        salesInvoiceId: 1, amount: 500_000, paymentDate: "2026-10-12", paymentMethod: "cash",
      });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.withholdingAmount).toBeUndefined();
    });
  });

  describe("updateQuotationSchema", () => {
    it("accepts an all-optional empty object", () => {
      expect(updateQuotationSchema.safeParse({}).success).toBe(true);
    });

    it("rejects customerId below 1", () => {
      expect(updateQuotationSchema.safeParse({ customerId: 0 }).success).toBe(false);
    });

    it("accepts valid optional fields", () => {
      const result = updateQuotationSchema.safeParse({
        customerId: 2, date: "2026-06-09", notes: "Catatan",
      });
      expect(result.success).toBe(true);
    });
  });
});
