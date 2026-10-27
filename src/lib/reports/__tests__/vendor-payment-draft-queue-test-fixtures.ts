import { expect } from "vitest"
import { getWibTodayUtcDate } from "@/lib/utils/attendance-time"

// Fixture bersama tes 072-B (builder + loader): Sonar menandai blok
// salin-tempel antar berkas tes draft-queue sebagai duplikasi; simpan
// hari tetap, daftar kunci, dan asersi kunci persis sekali di sini.
// Hari kalender WIB tetap: 2026-10-26 — instan 05:00 WIB.
export const VENDOR_PAYMENT_DRAFT_TEST_NOW = new Date("2026-10-25T22:00:00.000Z")
export const VENDOR_PAYMENT_DRAFT_TEST_TODAY = getWibTodayUtcDate(
  VENDOR_PAYMENT_DRAFT_TEST_NOW,
)
export const vendorPaymentDraftTestDay = (offset: number) =>
  new Date(VENDOR_PAYMENT_DRAFT_TEST_TODAY.getTime() + offset * 86_400_000)

// Daftar-putih ditulis CSV satu baris lalu dipecah — urutan tidak
// menjamin apa pun untuk Prisma; perbandingan selalu sebagai himpunan.
const keyList = (csv: string): readonly string[] => csv.split(",")

// Kunci select loader persis (BR-VPQ-04, tanpa adminFee).
export const VENDOR_PAYMENT_LOADER_SELECT_KEYS = keyList(
  "amount,createdAt,createdBy,deletedAt,documentNo,id,paymentDate,slug,status,vendor,vendorBill,vendorBillId,vendorId",
)
// Kunci Row builder persis — Input (13) + turunan (5). Suntik field
// asing (mis. adminFee/totalValue) ke Row WAJIB MERAH.
export const VENDOR_PAYMENT_ROW_KEYS = keyList(
  "amount,createdAt,createdByName,deletedAt,documentNo,paymentDate,paymentDateLampau,slug,status,tingkat,tingkatLabel,umurDariMasaDepan,umurDraftHari,vendorBillDocumentNo,vendorBillId,vendorId,vendorName,vendorPaymentId",
)
export const VENDOR_PAYMENT_QUEUE_KEYS = keyList(
  "levelCounts,rows,totalAmount,totalDocuments,totalLabel,vendorCounts",
)
export const VENDOR_PAYMENT_VENDOR_COUNT_KEYS = keyList(
  "levelCounts,total,totalAmount,vendorId,vendorName",
)

export function expectKeysPersis(actual: object, expected: readonly string[]): void {
  expect([...Object.keys(actual)].sort()).toEqual([...expected].sort())
}
