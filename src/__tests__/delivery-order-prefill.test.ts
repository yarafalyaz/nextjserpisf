import { describe, it, expect, vi, beforeEach } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import React from "react"

/**
 * Prefill rantai penjualan: halaman "tambah" yang selama ini mengabaikan
 * parameter tautan "buat dari", plus perhitungan sisa yang mengisinya.
 *
 * Tautan mati itu nyata: detail faktur mengirim `?fakturPenjualanId=` dan detail
 * pesanan mengirim `?salesOrderId=`, tetapi halaman surat jalan tidak membaca
 * `searchParams` sama sekali — klik "buat dari" membuka form kosong. Parameter
 * itu kini segmen path (`faktur/<slug>`, `pesanan/<slug>`; query lama memantul
 * ke sana). Test ini memanggil komponen halamannya langsung dengan segmen dan
 * memeriksa prop yang sampai ke formnya, jadi menghapus pembacaan segmen itu
 * memerahkan test.
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
    aggregate: vi.fn().mockResolvedValue({ _sum: {} }),
  })
  const prismaMock = {
    salesOrder: buildModelMock(),
    salesOrderItem: buildModelMock(),
    deliveryOrderItem: buildModelMock(),
    salesInvoice: buildModelMock(),
    salesReturnItem: buildModelMock(),
    customer: buildModelMock(),
    item: buildModelMock(),
  }
  return { prismaMock, requirePermissionMock: vi.fn().mockResolvedValue({ id: 1 }) }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermissionMock(...a),
}))
// Registry quick-add menarik server action master/finance yang mengimpor
// next-auth (butuh `next/server`) — di luar jangkauan tes unit murni.
vi.mock("@/lib/quick-add/registry", () => ({
  QUICK_ADD: new Proxy({}, { get: () => ({ title: "Stub", fields: [], action: vi.fn() }) }),
}))
vi.mock("@/actions/sales.actions", () => ({
  createSalesReturn: vi.fn().mockResolvedValue({ success: true }),
  updateSalesReturn: vi.fn().mockResolvedValue({ success: true }),
  createDeliveryOrder: vi.fn().mockResolvedValue({ success: true }),
  updateDeliveryOrder: vi.fn().mockResolvedValue({ success: true }),
}))
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  notFound: vi.fn(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}))

import CreateDeliveryOrderPage from "../app/(dashboard)/penjualan/surat-jalan/tambah/[[...segments]]/page"
import CreateSalesReturnPage from "../app/(dashboard)/penjualan/retur/tambah/[[...segments]]/page"
import { DeliveryOrderForm } from "@/components/forms/delivery-order-form"
import { SalesReturnForm } from "@/components/forms/sales-return-form"
import { buildDeliveryOrderLines } from "../app/(dashboard)/penjualan/surat-jalan/_lib/order-lines"
import { buildReturnPrefill } from "../app/(dashboard)/penjualan/retur/_lib/return-prefill"
import { DELIVERABLE_ORDER_STATUSES } from "@/lib/validations/sales.schemas"
import { FULFILLABLE_ORDER_STATUSES } from "@/lib/reports/order-fulfillment-data"

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

const SALES_ORDER = {
  id: 1,
  documentNo: "SO-001",
  deletedAt: null,
  status: "confirmed",
  customerId: 7,
  customer: { name: "Toko Maju" },
  items: [
    { id: 11, itemId: 5, description: null, qty: 10 },
    { id: 12, itemId: 6, description: "Jasa pasang", qty: 2 },
  ],
}

describe("buildDeliveryOrderLines", () => {
  it("menghitung sisa = qty pesanan − sudah masuk surat jalan", () => {
    const lines = buildDeliveryOrderLines({
      items: [{ id: 11, itemId: 5, description: null, qty: 10 }],
      shippedByLine: new Map([[11, 4]]),
      itemNameById: new Map([[5, "Busi"]]),
    })

    expect(lines).toEqual([
      {
        salesOrderItemId: 11,
        itemId: 5,
        description: "Busi",
        orderedQty: 10,
        shippedQty: 4,
        remainingQty: 6,
      },
    ])
  })

  it("membuang baris yang sudah terkirim penuh", () => {
    const lines = buildDeliveryOrderLines({
      items: [{ id: 11, itemId: 5, description: "Busi", qty: 10 }],
      shippedByLine: new Map([[11, 10]]),
    })

    expect(lines).toEqual([])
  })

  it("melewati baris pesanan tanpa barang katalog", () => {
    const lines = buildDeliveryOrderLines({
      items: [{ id: 11, itemId: null, description: "Barang custom", qty: 10 }],
    })

    expect(lines).toEqual([])
  })

  it("memakai qty Decimal (string) apa adanya", () => {
    const lines = buildDeliveryOrderLines({
      items: [{ id: 11, itemId: 5, description: null, qty: "10.50" }],
      itemNameById: new Map([[5, "Busi"]]),
    })

    expect(lines[0].orderedQty).toBe(10.5)
    expect(lines[0].remainingQty).toBe(10.5)
  })
})

describe("buildReturnPrefill", () => {
  it("mengisi faktur, pelanggan, dan sisa yang boleh diretur", () => {
    const prefill = buildReturnPrefill({
      invoice: { id: 3, customerId: 7, items: [{ itemId: 5, qty: 10 }] },
      returnedByItem: new Map([[5, 4]]),
    })

    expect(prefill).toEqual({ customerId: 7, salesInvoiceId: 3, items: [{ itemId: 5, qty: 6 }] })
  })

  it("membuang baris yang sudah diretur habis", () => {
    const prefill = buildReturnPrefill({
      invoice: { id: 3, customerId: 7, items: [{ itemId: 5, qty: 10 }] },
      returnedByItem: new Map([[5, 10]]),
    })

    expect(prefill).toBeNull()
  })

  it("tanpa faktur tidak ada prefill", () => {
    expect(buildReturnPrefill({ invoice: null })).toBeNull()
  })
})

describe("status surat jalan vs laporan pemenuhan", () => {
  it("semua status pesanan yang masuk laporan bisa dikirim", () => {
    for (const status of FULFILLABLE_ORDER_STATUSES) {
      expect(DELIVERABLE_ORDER_STATUSES).toContain(status)
    }
  })

  it("menerima approved: jalur tombol Setujui di halaman pesanan", () => {
    // /api/workflow tanpa workflow terkonfigurasi menaikkan SO draft→approved.
    // Kalau `approved` tidak diterima di gerbang surat jalan, tombol Setujui
    // membuat pesanan buntu: tak bisa disetujui-lalu-dikirim.
    expect(DELIVERABLE_ORDER_STATUSES).toContain("approved")
  })

  it("tidak menerima draft maupun cancelled", () => {
    expect(DELIVERABLE_ORDER_STATUSES).not.toContain("draft")
    expect(DELIVERABLE_ORDER_STATUSES).not.toContain("cancelled")
  })
})

describe("halaman surat jalan/tambah membaca segmen tautan", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.prismaMock.salesOrder.findMany.mockResolvedValue([SALES_ORDER])
    mocks.prismaMock.salesOrder.findFirst.mockResolvedValue({ id: 1, slug: "so-001" })
    mocks.prismaMock.salesInvoice.findFirst.mockResolvedValue({ id: 44, slug: "inv-044" })
    mocks.prismaMock.deliveryOrderItem.findMany.mockResolvedValue([])
    mocks.prismaMock.item.findMany.mockResolvedValue([{ id: 5, name: "Busi" }, { id: 6, name: "Jasa" }])
    mocks.prismaMock.salesInvoice.findUnique.mockResolvedValue(null)
  })

  const callPage = (segments?: string[]) =>
    CreateDeliveryOrderPage({
      params: Promise.resolve({ segments }),
      searchParams: Promise.resolve({}),
    })

  it("menyaring pesanan yang bisa dikirim memakai daftar status bersama", async () => {
    await callPage()

    const where = mocks.prismaMock.salesOrder.findMany.mock.calls[0][0].where
    expect(where.status.in).toEqual([...DELIVERABLE_ORDER_STATUSES])
  })

  it("segmen pesanan/<slug> memilih pesanan dan mengisi barisnya", async () => {
    const page = await callPage(["pesanan", "so-001"])
    const form = findElement(page, DeliveryOrderForm)

    expect(form).not.toBeNull()
    expect(form.props.defaultSalesOrderId).toBe(1)
    expect(form.props.salesOrders[0].lines).toEqual([
      { salesOrderItemId: 11, itemId: 5, description: "Busi", orderedQty: 10, shippedQty: 0, remainingQty: 10 },
      { salesOrderItemId: 12, itemId: 6, description: "Jasa pasang", orderedQty: 2, shippedQty: 0, remainingQty: 2 },
    ])
  })

  it("segmen faktur/<slug> dari detail faktur memakai pesanan faktur itu", async () => {
    mocks.prismaMock.salesInvoice.findUnique.mockResolvedValue({ id: 44, documentNo: "INV-044", salesOrderId: 1 })

    const page = await callPage(["faktur", "inv-044"])
    const form = findElement(page, DeliveryOrderForm)

    expect(mocks.prismaMock.salesInvoice.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 44 } }),
    )
    expect(form.props.defaultSalesOrderId).toBe(1)
  })

  it("segmen faktur/<slug> tanpa pesanan dijelaskan, bukan buntu", async () => {
    mocks.prismaMock.salesInvoice.findUnique.mockResolvedValue({ id: 44, documentNo: "INV-044", salesOrderId: null })

    const page = await callPage(["faktur", "inv-044"])
    const form = findElement(page, DeliveryOrderForm)

    expect(form.props.defaultSalesOrderId).toBeUndefined()
    expect(JSON.stringify(page).includes("tidak punya Pesanan Penjualan")).toBe(true)
  })

  it("segmen pesanan/<slug> yang tidak bisa dikirim dijelaskan", async () => {
    mocks.prismaMock.salesOrder.findFirst.mockResolvedValue({ id: 999, slug: "so-999" })

    const page = await callPage(["pesanan", "so-999"])
    const form = findElement(page, DeliveryOrderForm)

    expect(form.props.defaultSalesOrderId).toBeUndefined()
    expect(JSON.stringify(page).includes("tidak berstatus")).toBe(true)
  })
})

describe("tombol transisi status surat jalan terpasang di halaman detail", () => {
  it("halaman detail memakai shipDeliveryOrder dan deliverDeliveryOrder", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/(dashboard)/penjualan/surat-jalan/[slug]/page.tsx"),
      "utf8",
    )

    // Tanpa tombol ini surat jalan tak punya jalan keluar dari konsep, sedangkan
    // laporan Pemenuhan Pesanan hanya menghitung shipped/delivered.
    expect(source).toMatch(/action=\{shipDeliveryOrder\}/)
    expect(source).toMatch(/action=\{deliverDeliveryOrder\}/)
    // Hanya ditawarkan pada status yang benar.
    expect(source).toMatch(/deliveryOrder\.status === "draft"/)
    expect(source).toMatch(/deliveryOrder\.status === "shipped"/)
  })
})

describe("halaman retur/tambah membaca segmen faktur/<slug>", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.prismaMock.salesInvoice.findMany.mockResolvedValue([{ id: 3, documentNo: "INV-003" }])
    mocks.prismaMock.salesInvoice.findFirst.mockResolvedValue({ id: 3, slug: "inv-003" })
    mocks.prismaMock.customer.findMany.mockResolvedValue([{ id: 7, name: "Toko Maju" }])
    mocks.prismaMock.item.findMany.mockResolvedValue([{ id: 5, sku: "BRG-1", name: "Busi" }])
    mocks.prismaMock.salesReturnItem.findMany.mockResolvedValue([{ itemId: 5, qty: 4 }])
    mocks.prismaMock.salesInvoice.findUnique.mockResolvedValue({
      id: 3,
      documentNo: "INV-003",
      customerId: 7,
      status: "paid",
      items: [{ itemId: 5, qty: 10 }],
    })
  })

  const callPage = (segments?: string[]) =>
    CreateSalesReturnPage({
      params: Promise.resolve({ segments }),
      searchParams: Promise.resolve({}),
    })

  it("mengisi faktur, pelanggan, dan sisa barang yang belum diretur", async () => {
    const page = await callPage(["faktur", "inv-003"])
    const form = findElement(page, SalesReturnForm)

    expect(form).not.toBeNull()
    expect(form.props.returnData).toMatchObject({
      id: 0,
      customerId: 7,
      salesInvoiceId: 3,
      items: [{ itemId: 5, qty: 6 }],
    })
  })

  it("daftar faktur yang bisa diretur memakai RETURNABLE_INVOICE_STATUSES (termasuk lunas)", async () => {
    await callPage()

    const where = mocks.prismaMock.salesInvoice.findMany.mock.calls[0][0].where
    expect(where.status.in).toEqual(["posted", "partial", "paid"])
  })

  it("faktur konsep tidak di-prefill walau barisnya ada", async () => {
    mocks.prismaMock.salesInvoice.findUnique.mockResolvedValue({
      id: 3,
      documentNo: "INV-003",
      customerId: 7,
      status: "draft",
      items: [{ itemId: 5, qty: 10 }],
    })

    const page = await callPage(["faktur", "inv-003"])
    const form = findElement(page, SalesReturnForm)

    expect(form.props.returnData).toBeUndefined()
  })

  it("tanpa segmen, form tetap dibuka tanpa prefill", async () => {
    const page = await callPage()
    const form = findElement(page, SalesReturnForm)

    expect(form.props.returnData).toBeUndefined()
  })
})
