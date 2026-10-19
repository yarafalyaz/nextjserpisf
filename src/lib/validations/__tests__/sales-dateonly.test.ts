import { describe, it, expect } from "vitest";
import {
  updateQuotationSchema,
  createDownPaymentSchema,
  createSalesOrderSchema,
  updateSalesOrderSchema,
  createSalesInvoiceSchema,
  createSalesPaymentSchema,
  createSalesReturnSchema,
  createDeliveryOrderSchema,
  updateDeliveryOrderSchema,
} from "@/lib/validations/sales.schemas";
import { wibDateToUtcMidnight } from "@/lib/utils/attendance-time";

describe("validations/sales dateOnly dokumen penjualan", () => {
  it("updateQuotation menolak date fiktif 2026-02-30", () => {
    expect(updateQuotationSchema.safeParse({ date: "2026-02-30" }).success).toBe(false);
  });
  it("updateQuotation menolak validUntil bebas", () => {
    expect(updateQuotationSchema.safeParse({ validUntil: "besok" }).success).toBe(false);
  });
  it("createDownPayment menolak paymentDate fiktif", () => {
    expect(
      createDownPaymentSchema.safeParse({ quotationId: 1, amount: 1000, paymentDate: "2026-02-30" })
        .success,
    ).toBe(false);
  });
  it("createSalesOrder menolak date fiktif + deliveryDate fiktif", () => {
    expect(
      createSalesOrderSchema.safeParse({ customerId: 1, date: "2026-02-30" }).success,
    ).toBe(false);
    expect(
      createSalesOrderSchema.safeParse({
        customerId: 1,
        date: "2026-10-20",
        deliveryDate: "2026-02-30",
      }).success,
    ).toBe(false);
  });
  it("updateSalesOrder menolak date fiktif", () => {
    expect(
      updateSalesOrderSchema.safeParse({ customerId: 1, date: "2026-02-30" }).success,
    ).toBe(false);
  });
  it("createSalesInvoice menolak date fiktif + dueDate fiktif", () => {
    expect(
      createSalesInvoiceSchema.safeParse({ customerId: 1, date: "2026-04-31" }).success,
    ).toBe(false);
    expect(
      createSalesInvoiceSchema.safeParse({ customerId: 1, date: "2026-10-20", dueDate: "2026-02-30" })
        .success,
    ).toBe(false);
  });
  it("createSalesPayment menolak paymentDate fiktif", () => {
    expect(
      createSalesPaymentSchema.safeParse({
        customerId: 1,
        amount: 1000,
        paymentDate: "2026-02-30",
        paymentMethod: "transfer",
      }).success,
    ).toBe(false);
  });
  it("createSalesReturn menolak date fiktif", () => {
    expect(
      createSalesReturnSchema.safeParse({ customerId: 1, date: "2026-02-30" }).success,
    ).toBe(false);
  });
  it("createDeliveryOrder menolak date fiktif", () => {
    expect(
      createDeliveryOrderSchema.safeParse({ salesOrderId: 1, date: "2026-02-30" }).success,
    ).toBe(false);
  });
  it("updateDeliveryOrder menolak deliveryDate fiktif", () => {
    expect(
      updateDeliveryOrderSchema.safeParse({
        salesOrderId: 1,
        date: "2026-10-20",
        deliveryDate: "2026-02-30",
      }).success,
    ).toBe(false);
  });
  it("tanggal sah tetap string dateOnly; kosong opsional jadi undefined; konversi WIB tengah-malam UTC", () => {
    const r = createSalesOrderSchema.safeParse({
      customerId: 1,
      date: "2026-10-20",
      deliveryDate: "",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.date).toBe("2026-10-20");
      expect(r.data.deliveryDate).toBeUndefined();
    }
    expect(wibDateToUtcMidnight("2026-10-20").toISOString()).toBe("2026-10-20T00:00:00.000Z");
  });
});
