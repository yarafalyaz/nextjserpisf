import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  salesPaymentCount: vi.fn(),
  customerFindMany: vi.fn(),
  salesOrderFindMany: vi.fn(),
  itemFindMany: vi.fn(),
  salesInvoiceItemFindMany: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    salesPayment: { count: mocks.salesPaymentCount },
    customer: { findMany: mocks.customerFindMany },
    salesOrder: { findMany: mocks.salesOrderFindMany },
    item: { findMany: mocks.itemFindMany },
    salesInvoiceItem: { findMany: mocks.salesInvoiceItemFindMany },
  },
}))
vi.mock("@/lib/auth/permissions", () => ({ requirePermission: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/utils/resolve-entity", () => ({
  resolveEntity: vi.fn().mockResolvedValue({
    id: 7,
    slug: "inv-7",
    documentNo: "INV/7",
    status: "draft",
    customerId: 11,
    salesOrderId: 33,
    date: new Date("2026-10-01T00:00:00Z"),
    dueDate: new Date("2026-10-31T00:00:00Z"),
    taxInvoiceNumber: "010.000-26.00000001",
    notes: "catatan",
    subtotal: 1_000_000,
    discount: 0,
    taxAmount: 110_000,
  }),
}))
vi.mock("@/components/forms/sales-invoice-form", () => ({ SalesInvoiceForm: () => null }))
vi.mock("@/components/ui/breadcrumbs", () => ({ AppBreadcrumbs: () => null }))
vi.mock("@/components/ui/locked-edit-guard", () => ({ LockedEditGuard: () => null }))
vi.mock("next/navigation", () => ({ notFound: vi.fn() }))

import EditPage from "../page"

/** Cari elemen form di pohon hasil render (komponen anak tak dieksekusi). */
function findFormProps(node: any): any {
  if (!node || typeof node !== "object") return null
  const props = node.props
  if (!props) return null
  if ("initialItems" in props || "availableItems" in props) return props
  const children = props.children
  const list = Array.isArray(children) ? children : [children]
  for (const child of list) {
    const found = findFormProps(child)
    if (found) return found
  }
  return null
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.salesPaymentCount.mockResolvedValue(0)
  mocks.customerFindMany.mockResolvedValue([])
  mocks.salesOrderFindMany.mockResolvedValue([])
  mocks.itemFindMany.mockResolvedValue([
    { id: 9, name: "Busi Iridium", sku: "BI-1", price: 250_000, isScrapSaleItem: false },
  ])
  mocks.salesInvoiceItemFindMany.mockResolvedValue([
    {
      id: 501,
      itemId: 9,
      description: "Busi Iridium",
      qty: 2,
      unitPrice: 250_000,
      discount: 10_000,
      uom: "PCS",
      serialNumbers: ["SN-1", "SN-2"],
    },
  ])
})

describe("Ubah Faktur — baris & PPN dimuat ke form (putaran 110)", () => {
  it("meneruskan baris tersimpan + tarif PPN + daftar barang ke form", async () => {
    const props = findFormProps(await EditPage({ params: Promise.resolve({ slug: "inv-7" }) }))

    // Baris tersimpan wajib ikut: form tanpa initialItems = tabel kosong, dan
    // simpan menjalankan deleteMany + createMany sehingga seluruh baris lama
    // hilang bila operator menambah satu baris.
    expect(props?.initialItems).toEqual([
      expect.objectContaining({
        itemId: 9,
        description: "Busi Iridium",
        qty: 2,
        unitPrice: 250_000,
        discount: 10_000,
        uom: "PCS",
        serialNumbers: ["SN-1", "SN-2"],
      }),
    ])
    // PPN diturunkan dari nominal tersimpan (taxAmount / (subtotal - discount)),
    // bukan 0 yang menulis ulang faktur jadi tanpa pajak.
    expect(props?.initialTaxRate).toBe(11)
    expect(props?.availableItems).toEqual([
      expect.objectContaining({ id: 9, name: "Busi Iridium", price: 250_000 }),
    ])
  })

  it("pemilih pesanan memakai status yang sama dengan gerbang server", async () => {
    await EditPage({ params: Promise.resolve({ slug: "inv-7" }) })

    const where = (mocks.salesOrderFindMany.mock.calls[0][0] as any).where
    // DELIVERABLE_ORDER_STATUSES + pesanan yang sekarang tertaut (walau
    // statusnya di luar daftar) supaya tautan lama tetap tampil.
    expect(where.OR[0].status.in).toEqual(["approved", "confirmed", "processing", "completed"])
    expect(where.OR[1]).toEqual({ id: 33 })
  })
})
