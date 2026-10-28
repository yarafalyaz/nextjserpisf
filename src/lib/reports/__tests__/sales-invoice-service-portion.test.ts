import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Read-model porsi jasa-vs-barang F-2026-10-28-137-V V1/V1a (SAL-BR-013).
 * Definisi baris jasa VERBATIM vonis: itemId null (teks bebas) ATAU item
 * ter-resolve isProduct=false. isService TIDAK dipakai sebagai penentu.
 */
const mocks = vi.hoisted(() => ({
  invoiceFindUniqueOrThrow: vi.fn(),
  itemFindMany: vi.fn(),
  settingFindFirst: vi.fn(),
  accountFindUnique: vi.fn(),
  requirePermission: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    salesInvoice: {
      findUniqueOrThrow: (...a: unknown[]) => mocks.invoiceFindUniqueOrThrow(...a),
    },
    item: { findMany: (...a: unknown[]) => mocks.itemFindMany(...a) },
    systemSetting: { findFirst: (...a: unknown[]) => mocks.settingFindFirst(...a) },
    account: { findUnique: (...a: unknown[]) => mocks.accountFindUnique(...a) },
  },
}))
vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermission(...a),
}))

import {
  getSalesInvoiceServicePortion,
  splitInvoiceServicePortion,
} from "../sales-invoice-service-portion-data"

function seedLoader(opts: {
  items: Array<{ itemId: number | null; qty: number; total: number }>;
  isProductById?: Record<number, boolean>;
  serviceAccountId?: number | null;
  serviceAccountName?: string | null;
}) {
  mocks.invoiceFindUniqueOrThrow.mockResolvedValue({ id: 7, items: opts.items })
  mocks.itemFindMany.mockResolvedValue(
    Object.entries(opts.isProductById ?? {}).map(([id, isProduct]) => ({
      id: Number(id),
      isProduct,
    })),
  )
  mocks.settingFindFirst.mockResolvedValue({
    salesServiceRevenueAccountId: opts.serviceAccountId ?? null,
  })
  mocks.accountFindUnique.mockResolvedValue(
    opts.serviceAccountName != null ? { name: opts.serviceAccountName } : null,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue(undefined)
})

describe("splitInvoiceServicePortion (F-137-V V1a, pure)", () => {
  it("baris teks bebas (itemId null) = jasa", () => {
    const r = splitInvoiceServicePortion(
      [{ itemId: null, qty: 1, total: 600000 }],
      new Map(),
    )
    expect(r).toEqual({ serviceSubtotal: 600000, goodsSubtotal: 0, hasServiceLines: true })
  })

  it("item isProduct=false = jasa; isProduct=true = barang", () => {
    const r = splitInvoiceServicePortion(
      [
        { itemId: 61, qty: 2, total: 400000 },
        { itemId: 50, qty: 2, total: 1500000 },
      ],
      new Map([[61, false], [50, true]]),
    )
    expect(r).toEqual({ serviceSubtotal: 400000, goodsSubtotal: 1500000, hasServiceLines: true })
  })

  it("item orphan (tak ter-resolve) = barang, bukan jasa", () => {
    const r = splitInvoiceServicePortion(
      [{ itemId: 99, qty: 1, total: 100000 }],
      new Map(),
    )
    expect(r).toEqual({ serviceSubtotal: 0, goodsSubtotal: 100000, hasServiceLines: false })
  })

  it("baris qty 0 dilewati dua-duanya", () => {
    const r = splitInvoiceServicePortion(
      [
        { itemId: null, qty: 0, total: 999 },
        { itemId: 50, qty: 2, total: 1500000 },
      ],
      new Map([[50, true]]),
    )
    expect(r).toEqual({ serviceSubtotal: 0, goodsSubtotal: 1500000, hasServiceLines: false })
  })

  it("sen-persis: 0.1 + 0.2 = 0.3 bukan 0.30000000000000004", () => {
    const r = splitInvoiceServicePortion(
      [
        { itemId: null, qty: 1, total: 0.1 },
        { itemId: null, qty: 1, total: 0.2 },
      ],
      new Map(),
    )
    expect(r.serviceSubtotal).toBe(0.3)
    expect(r.hasServiceLines).toBe(true)
  })
})

describe("getSalesInvoiceServicePortion (loader server)", () => {
  it("faktur campur kembalikan porsi sen-persis + status mapping akun", async () => {
    seedLoader({
      items: [
        { itemId: null, qty: 1, total: 500000 },
        { itemId: 50, qty: 2, total: 1500000 },
      ],
      isProductById: { 50: true },
      serviceAccountId: 411,
      serviceAccountName: "Pendapatan Jasa",
    })

    const r = await getSalesInvoiceServicePortion(7)

    expect(mocks.requirePermission).toHaveBeenCalledWith("view_sales_invoices")
    expect(r).toEqual({
      invoiceId: 7,
      serviceSubtotal: 500000,
      goodsSubtotal: 1500000,
      hasServiceLines: true,
      serviceRevenueAccountConfigured: true,
      serviceRevenueAccountName: "Pendapatan Jasa",
    })
  })

  it("faktur berjasa tetapi akun belum dipetakan: banner syarat terpenuhi", async () => {
    seedLoader({
      items: [{ itemId: null, qty: 1, total: 600000 }],
      serviceAccountId: null,
    })

    const r = await getSalesInvoiceServicePortion(7)

    expect(r.hasServiceLines).toBe(true)
    expect(r.serviceRevenueAccountConfigured).toBe(false)
    expect(r.serviceRevenueAccountName).toBeNull()
    expect(mocks.accountFindUnique).not.toHaveBeenCalled()
  })
})
