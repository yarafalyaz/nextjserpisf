import type {
  DownPaymentQueueDpInput,
  DownPaymentQueueQuotationInput,
} from "../down-payment-verification-queue"

/** Fixture bersama builder + kartu antrean verifikasi DP 051-S. Default per pemanggil tetap beda lewat `over`. */
export function dpQueueDp(
  partial: Partial<DownPaymentQueueDpInput> & { downPaymentId: number },
  over: Partial<DownPaymentQueueDpInput> = {},
): DownPaymentQueueDpInput {
  return {
    documentNo: `DP-${partial.downPaymentId}`,
    quotationId: 1,
    customerId: 7,
    customerName: "CV Uji",
    amount: 10_000_000,
    paymentDate: new Date("2026-10-25T00:00:00.000Z"),
    paymentMethod: "transfer",
    adaBukti: true,
    status: "draft",
    createdAt: new Date("2026-10-25T20:00:00.000Z"),
    ...over,
    ...partial,
  }
}

export function dpQueueQuotation(
  partial: Partial<DownPaymentQueueQuotationInput> = {},
): DownPaymentQueueQuotationInput {
  return {
    quotationId: 1,
    quotationDocumentNo: "Q-001",
    quotationStatus: "accepted",
    grandTotal: 100_000_000,
    invoiceThresholdPercent: 50,
    ...partial,
  }
}
