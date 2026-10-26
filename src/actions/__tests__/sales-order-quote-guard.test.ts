import { describe, it, expect, vi, beforeEach } from "vitest"

// Penjagaan "satu penawaran = satu pesanan penjualan" untuk jalur UI.
//
// Kenapa berkas ini ada: aksi convertQuotationToOrder punya kunci baris + cek
// idempotensi, tetapi TIDAK dipanggil UI mana pun — jalur yang dipakai pengguna
// adalah form Pesanan Penjualan (createSalesOrder) lewat
// /penjualan/pesanan/tambah/penawaran/<slug>. Sebelum ini, jalur itu menulis
// quotationId tanpa memeriksa apakah penawaran sudah pernah dikonversi, jadi
// tombol "+ Pesanan Penjualan" yang diklik dua kali (atau URL yang dipakai
// ulang) melahirkan dua SO dari satu penawaran. Tes ini menjaga aturannya tetap
// ada dan tetap memakai kunci baris sebelum cek-lalu-buat.

const requirePermissionMock = vi.fn()
const revalidateMock = vi.fn()
const logActivityMock = vi.fn()
const generateDocNumberMock = vi.fn()
const transactionMock = vi.fn()
const checkIdempotencyMock = vi.fn()

const queryRawMock = vi.fn()
const soFindFirstMock = vi.fn()
const soCreateMock = vi.fn()
// `createSalesOrder` juga membaca item penawaran lewat tx (untuk menyalinnya ke
// pesanan baru). Tiruan tx di sini harus mencakupnya, kalau tidak aksi gagal
// sebelum sempat memanggil create.
const quotationFindUniqueMock = vi.fn()

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => requirePermissionMock(...a),
}))
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    quotation: { findUniqueOrThrow: vi.fn() },
    $transaction: (...a: unknown[]) => transactionMock(...a),
  },
}))
vi.mock("@/lib/utils/idempotency", () => ({
  checkIdempotency: (...a: unknown[]) => checkIdempotencyMock(...a),
}))
vi.mock("@/lib/hooks/accounting.hook", () => ({
  onSalesInvoicePosted: vi.fn(), onSalesPaymentCreated: vi.fn(), onSalesReturnCompleted: vi.fn(),
  onDownPaymentReceived: vi.fn(), deleteJournalByReference: vi.fn(), deleteJournalByReferenceTx: vi.fn(),
}))
vi.mock("@/lib/hooks/down-payment.hook", () => ({ onDownPaymentConfirmed: vi.fn() }))
vi.mock("@/lib/hooks/sales-payment.hook", () => ({
  onSalesPaymentCreated: vi.fn(), onSalesPaymentUpdated: vi.fn(), onSalesPaymentDeleted: vi.fn(),
}))
vi.mock("@/lib/hooks/sales-return.hook", () => ({ onSalesReturnCompleted: vi.fn() }))
vi.mock("@/lib/services/notification.service", () => ({ notificationService: {} }))
vi.mock("@/lib/services/quotation-sync.service", () => ({ resyncOnEdit: vi.fn() }))
vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: (...a: unknown[]) => generateDocNumberMock(...a),
}))
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidateMock(...a) }))
vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: (...a: unknown[]) => logActivityMock(...a),
}))
vi.mock("@/lib/utils/slug-db", () => ({ nextSlug: vi.fn(async () => "test-slug") }))
vi.mock("@/lib/services/period-lock.service", () => ({
  assertPeriodOpen: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/services/credit-gate.service", () => ({
  assessCreditGateInTx: vi.fn().mockResolvedValue({ kind: "gate_off" }),
  assertCreditGatePassed: () => null,
  markCreditOverrideUsed: vi.fn(),
}))

import { createSalesOrder } from "../sales.actions"

function formData(extra: Record<string, string> = {}) {
  const fd = new FormData()
  fd.set("customerId", "1")
  fd.set("date", "2026-01-15")
  for (const [k, v] of Object.entries(extra)) fd.set(k, v)
  return fd
}

function wireTransaction() {
  const tx = {
    $queryRaw: queryRawMock,
    salesOrder: { findFirst: soFindFirstMock, create: soCreateMock },
    quotation: { findUnique: quotationFindUniqueMock },
  }
  transactionMock.mockImplementation(async (fn: (t: unknown) => unknown) => fn(tx))
  return tx
}

beforeEach(() => {
  vi.clearAllMocks()
  requirePermissionMock.mockResolvedValue({ id: "7" })
  generateDocNumberMock.mockResolvedValue("SO-2026-0001")
  checkIdempotencyMock.mockResolvedValue(undefined)
  logActivityMock.mockResolvedValue(undefined)
  soCreateMock.mockResolvedValue({ id: 99 })
  quotationFindUniqueMock.mockResolvedValue(null)
})

describe("createSalesOrder — penjagaan konversi penawaran", () => {
  it("menolak pesanan kedua dari penawaran yang sudah dikonversi", async () => {
    wireTransaction()
    soFindFirstMock.mockResolvedValue({ documentNo: "SO-2026-0001" })

    const result = await createSalesOrder(formData({ quotationId: "5" }))

    expect(result.success).toBe(false)
    expect(result.error).toContain("sudah memiliki Pesanan Penjualan SO-2026-0001")
    expect(soCreateMock).not.toHaveBeenCalled()
  })

  it("mengunci baris penawaran SEBELUM cek apakah sudah ada pesanan", async () => {
    wireTransaction()
    soFindFirstMock.mockResolvedValue(null)

    await createSalesOrder(formData({ quotationId: "5" }))

    expect(queryRawMock).toHaveBeenCalledTimes(1)
    expect(queryRawMock.mock.invocationCallOrder[0]).toBeLessThan(
      soFindFirstMock.mock.invocationCallOrder[0],
    )
    expect(soCreateMock).toHaveBeenCalledTimes(1)
  })

  it("tetap bisa membuat pesanan manual tanpa penawaran (tanpa kunci baris)", async () => {
    wireTransaction()

    const result = await createSalesOrder(formData())

    expect(result.success).toBe(true)
    expect(queryRawMock).not.toHaveBeenCalled()
    expect(soFindFirstMock).not.toHaveBeenCalled()
    expect(soCreateMock).toHaveBeenCalledTimes(1)
  })
})
