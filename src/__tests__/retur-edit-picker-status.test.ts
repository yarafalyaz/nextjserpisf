import { describe, it, expect, vi, beforeEach } from "vitest"
import React from "react"

/**
 * Halaman UBAH retur menawarkan dokumen yang pasti ditolak backend.
 *
 * `createSalesReturn`/`updateSalesReturn` menolak faktur di luar
 * `RETURNABLE_INVOICE_STATUSES`, dan `updatePurchaseReturn` menilai ulang
 * kuantitas diterima lewat `assertPurchaseReturnWithinReceived` (GR
 * verified/completed). Halaman TAMBAH menyaring daftarnya sesuai gerbang itu,
 * tetapi kedua halaman UBAH membaca SELURUH tabel tanpa `where`: faktur
 * konsep/batal dan PO batal/draft tetap muncul sebagai pilihan yang tampak
 * sah, dan pengguna baru menemukan penolakannya setelah mengisi form.
 *
 * Tes ini memanggil komponen halaman langsung dan memeriksa `where` yang
 * sampai ke Prisma — mencabut saringannya memerahkan tes.
 */

const mocks = vi.hoisted(() => {
  const buildModelMock = () => ({
    findFirst: vi.fn().mockResolvedValue(null),
    findUnique: vi.fn().mockResolvedValue(null),
    findUniqueOrThrow: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: 1 }),
    update: vi.fn().mockResolvedValue({}),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    delete: vi.fn().mockResolvedValue({}),
    count: vi.fn().mockResolvedValue(0),
  })
  const prismaMock = {
    salesReturn: buildModelMock(),
    salesInvoice: buildModelMock(),
    customer: buildModelMock(),
    item: buildModelMock(),
    purchaseReturn: buildModelMock(),
    purchaseOrder: buildModelMock(),
    goodsReceiptItem: buildModelMock(),
  }
  return { prismaMock, requirePermissionMock: vi.fn().mockResolvedValue({ id: 1 }) }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermissionMock(...a),
}))
// Registry quick-add menarik server action master (butuh next-auth/`next/server`).
vi.mock("@/lib/quick-add/registry", () => ({
  QUICK_ADD: new Proxy({}, { get: () => ({ title: "Stub", fields: [], action: vi.fn() }) }),
}))
vi.mock("@/actions/sales.actions", () => ({
  createSalesReturn: vi.fn().mockResolvedValue({ success: true }),
  updateSalesReturn: vi.fn().mockResolvedValue({ success: true }),
}))
vi.mock("@/actions/purchase.actions", () => ({
  createPurchaseReturn: vi.fn().mockResolvedValue({ success: true }),
  updatePurchaseReturn: vi.fn().mockResolvedValue({ success: true }),
}))
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  notFound: vi.fn(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}))

import EditSalesReturnPage from "../app/(dashboard)/penjualan/retur/[slug]/ubah/page"
import EditPurchaseReturnPage from "../app/(dashboard)/pembelian/retur/[slug]/ubah/page"
import { SalesReturnForm } from "@/components/forms/sales-return-form"
import { RETURNABLE_INVOICE_STATUSES } from "@/lib/validations/sales.schemas"

/** Status PO yang boleh diretur — salinan daftar halaman TAMBAH retur pembelian. */
const RETURNABLE_PO_STATUSES = [
  "received",
  "partial_received",
  "verified",
  "completed",
  "ordered",
]

/** Cari elemen React bertipe `type` di dalam pohon yang dikembalikan komponen. */
function findElement(node: unknown, type: unknown): any {
  if (node === null || node === undefined || typeof node !== "object") return null
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, type)
      if (found) return found
    }
    return null
  }
  if (!React.isValidElement(node)) return null
  if (node.type === type) return node
  return findElement((node.props as { children?: unknown }).children, type)
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
  const p = mocks.prismaMock
  p.salesReturn.findFirst.mockResolvedValue({
    id: 9,
    customerId: 7,
    salesInvoiceId: 3,
    date: new Date("2026-10-02T00:00:00.000Z"),
    reason: "Rusak",
    taxReturnNoteNumber: null,
    taxReturnNoteDate: null,
    items: [{ itemId: 5, qty: 2, serialNumbers: [], batchNumbers: [] }],
  })
  p.salesInvoice.findMany.mockResolvedValue([{ id: 3, documentNo: "INV-003" }])
  p.customer.findMany.mockResolvedValue([{ id: 7, name: "Toko Maju" }])
  p.item.findMany.mockResolvedValue([{ id: 5, sku: "BRG-1", name: "Busi" }])

  p.purchaseReturn.findFirst.mockResolvedValue({
    id: 11,
    purchaseOrderId: 4,
    date: new Date("2026-10-02T00:00:00.000Z"),
    reason: "Rusak",
    taxReturnNoteNumber: null,
    taxReturnNoteDate: null,
    items: [{ itemId: 5, qty: 2, goodsReceiptItemId: null }],
  })
  p.purchaseOrder.findMany.mockResolvedValue([{ id: 4, documentNo: "PO-004" }])
  p.goodsReceiptItem.findMany.mockResolvedValue([])
})

describe("halaman ubah retur penjualan hanya menawarkan faktur yang bisa diretur", () => {
  it("daftar faktur disaring RETURNABLE_INVOICE_STATUSES seperti halaman tambah", async () => {
    await EditSalesReturnPage({ params: Promise.resolve({ slug: "sr-0009" }) })

    const where = mocks.prismaMock.salesInvoice.findMany.mock.calls[0][0].where
    const clauses = where.OR ?? [where]
    const statusClause = clauses.find((c: { status?: unknown }) => c.status)
    expect(statusClause.status.in).toEqual([...RETURNABLE_INVOICE_STATUSES])
  })

  it("faktur yang tertaut pada retur ini tetap punya label walau statusnya di luar daftar", async () => {
    // Faktur tertaut adalah nilai yang sedang tampil di Combobox. Tanpa klausa
    // ini opsi hilang dan labelnya berubah jadi placeholder, padahal id-nya
    // tetap terkirim lewat hidden input — pengguna melihat faktur "kosong".
    await EditSalesReturnPage({ params: Promise.resolve({ slug: "sr-0009" }) })

    const where = mocks.prismaMock.salesInvoice.findMany.mock.calls[0][0].where
    expect(JSON.stringify(where)).toContain('"id":3')
  })

  it("faktur terkirim ke form tanpa baris tombstone", async () => {
    mocks.prismaMock.salesInvoice.findMany.mockResolvedValue([
      { id: 3, documentNo: "INV-003" },
    ])

    const page = await EditSalesReturnPage({ params: Promise.resolve({ slug: "sr-0009" }) })
    const form = findElement(page, SalesReturnForm)

    expect(form.props.invoices.map((i: { id: number }) => i.id)).toEqual([3])
  })
})

describe("halaman ubah retur pembelian hanya menawarkan PO yang bisa diretur", () => {
  it("daftar PO disaring status yang bisa diretur + deletedAt null", async () => {
    await EditPurchaseReturnPage({ params: Promise.resolve({ slug: "pret-0011" }) })

    const where = mocks.prismaMock.purchaseOrder.findMany.mock.calls[0][0].where
    const clauses = where.OR
    const eligible = clauses.find((clause: { status?: unknown }) => clause.status)
    expect(eligible.deletedAt).toBeNull()
    expect(eligible.status.in).toEqual(RETURNABLE_PO_STATUSES)
    expect(clauses.find((clause: { id?: number }) => clause.id)?.id).toBe(4)
  })

  it("PO yang sedang tertaut tetap tersedia walau statusnya di luar daftar", async () => {
    // Retur draft bisa menunjuk PO yang kemudian dibatalkan; tanpa klausa ini
    // Combobox kehilangan labelnya padahal updatePurchaseReturn masih
    // mengizinkan PO itu (ia tidak menggerbang status PO).
    await EditPurchaseReturnPage({ params: Promise.resolve({ slug: "pret-0011" }) })

    const where = mocks.prismaMock.purchaseOrder.findMany.mock.calls[0][0].where
    expect(JSON.stringify(where.OR)).toContain('"id":4')
  })
})
