import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Loader ekspor Coretax (F-113-V): snapshot dibaca massal, SellerIDTKU
 * dibaca dari SystemSetting.companyNitku (TASK-020 B5); kosong → builder
 * menolak bernama, terisi 22 digit → XML terbentuk.
 * Mock prisma pola tax-invoice.service.test.ts.
 */

const mocks = vi.hoisted(() => {
  const systemSettingFindFirst = vi.fn()
  const taxInvoiceFindMany = vi.fn()
  const customerFindMany = vi.fn()
  const itemFindMany = vi.fn()
  const prisma = {
    systemSetting: { findFirst: systemSettingFindFirst },
    taxInvoice: { findMany: taxInvoiceFindMany },
    customer: { findMany: customerFindMany },
    item: { findMany: itemFindMany },
  }
  return { systemSettingFindFirst, taxInvoiceFindMany, customerFindMany, itemFindMany, prisma }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }))

import { loadCoretaxOutputExport } from "@/lib/tax/coretax-xml-export-data"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.systemSettingFindFirst.mockResolvedValue({ companyTaxId: "1090000000002325" })
  mocks.customerFindMany.mockResolvedValue([{ id: 3, address: "Jalan Jakarta", email: "a2@some.com" }])
  mocks.itemFindMany.mockResolvedValue([{ id: 8, name: "Barang ABC", unitOfMeasure: "PCS", isService: false }])
  mocks.taxInvoiceFindMany.mockImplementation(({ where }: { where: { id: { in: number[] } } }) => {
    if (where.id.in.includes(10)) {
      return Promise.resolve([{ id: 10, taxInvoiceNumber: "040.001-26.00000001" }])
    }
    return Promise.resolve([
      {
        id: 1,
        direction: "out",
        transactionCode: "04",
        taxInvoiceNumber: "040.001-26.00000001",
        taxInvoiceDate: new Date(2026, 0, 15),
        dpp: { toNumber: () => 11_000_000 },
        taxRate: { toNumber: () => 12 },
        taxAmount: { toNumber: () => 1_320_000 },
        djpStatus: "draft",
        replacesId: null,
        counterpartyTaxId: "3174061502560010",
        counterpartyName: "Kongsi PPN",
        counterpartyNitku: "1090000000002325000000",
        salesInvoiceId: 5,
        salesInvoice: {
          status: "posted",
          customerId: 3,
          items: [
            {
              description: "Barang ABC",
              qty: { toNumber: () => 1 },
              uom: "PCS",
              unitPrice: { toNumber: () => 12_000_000 },
              discount: { toNumber: () => 0 },
              total: { toNumber: () => 12_000_000 },
              itemId: 8,
            },
          ],
        },
      },
    ])
  })
})

describe("loadCoretaxOutputExport", () => {
  it("NITKU penjual kosong: faktur tertolak bernama, tanpa berkas (fail-closed jujur)", async () => {
    const r = await loadCoretaxOutputExport([1])
    expect(r.xml).toBeNull()
    expect(r.rejections[0].code).toBe("MISSING_SELLER_IDTKU")
    expect(r.readyLabel).toBe("siap impor Coretax")
  })

  // B5: NITKU terisi dari pengaturan perusahaan → loader meneruskannya ke
  // builder dan ekspor faktur sah menghasilkan XML (dulu selalu gagal 100%).
  it("B5: NITKU penjual terisi dari SystemSetting → XML terbentuk", async () => {
    mocks.systemSettingFindFirst.mockResolvedValue({
      companyTaxId: "1090000000002325",
      companyNitku: "1090000000002325000000",
    })
    const r = await loadCoretaxOutputExport([1])
    expect(r.xml).not.toBeNull()
    expect(r.xml).toContain("<SellerIDTKU>1090000000002325000000</SellerIDTKU>")
    expect(r.exportedIds).toEqual([1])
    expect(r.rejections).toEqual([])
  })

  it("daftar kosong → tanpa berkas, tanpa query faktur karangan", async () => {
    const r = await loadCoretaxOutputExport([])
    expect(r.xml).toBeNull()
    expect(r.exportedIds).toEqual([])
  })
})
