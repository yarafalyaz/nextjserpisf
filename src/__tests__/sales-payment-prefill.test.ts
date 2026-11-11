import { describe, it, expect, vi, beforeEach } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import React from "react"

/**
 * Prefill pembayaran penjualan: tautan "buat dari" detail faktur memakai
 * segmen path `tambah/faktur/<id>` (bukan `?invoiceId=`) dan harus benar-
 * benar menarik faktur itu ke form — faktur yang belum bisa dibayar
 * (konsep/lunas/batal) dijelaskan, bukan hilang diam-diam di form kosong.
 * URL query lama diarahkan ke bentuk path.
 *
 * Bug aslinya dobel: tombol "Terima Pembayaran" di header detail faktur
 * tampil untuk status apa pun selain lunas/batal, padahal form hanya memuat
 * faktur posted/partial dan action server menolak status lain. Klik dari
 * faktur konsep membuka form yang tidak menemukan fakturnya.
 */

const mocks = vi.hoisted(() => {
  const buildModelMock = () => ({
    findFirst: vi.fn().mockResolvedValue(null),
    findUnique: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
  })
  const prismaMock = {
    salesInvoice: buildModelMock(),
    account: buildModelMock(),
    withholdingTaxType: buildModelMock(),
  }
  return {
    prismaMock,
    requirePermissionMock: vi.fn().mockResolvedValue({ id: 1 }),
    redirectMock: vi.fn((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`)
    }),
    notFoundMock: vi.fn(() => {
      throw new Error("NEXT_NOT_FOUND")
    }),
  }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermissionMock(...a),
}))
vi.mock("@/lib/services/method.service", () => ({
  getActivePaymentMethods: vi.fn().mockResolvedValue([]),
}))
// Registry quick-add menarik server action yang mengimpor next-auth.
vi.mock("@/lib/quick-add/registry", () => ({
  QUICK_ADD: new Proxy({}, { get: () => ({ title: "Stub", fields: [], action: vi.fn() }) }),
}))
vi.mock("@/actions/sales.actions", () => ({
  createSalesPayment: vi.fn().mockResolvedValue({ success: true }),
  updateSalesPayment: vi.fn().mockResolvedValue({ success: true }),
}))
vi.mock("next/navigation", () => ({
  redirect: (url: string) => mocks.redirectMock(url),
  notFound: () => mocks.notFoundMock(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}))

import CreatePaymentPage from "../app/(dashboard)/penjualan/pembayaran/tambah/[[...segments]]/page"
import { PaymentForm } from "@/components/forms/payment-form"

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

/** Kumpulkan semua teks string dari pohon React (JSON.stringify gagal pada elemen ikon). */
function pageText(node: unknown): string {
  if (typeof node === "string") return node
  if (Array.isArray(node)) return node.map(pageText).join(" ")
  if (node && typeof node === "object" && React.isValidElement(node)) {
    const props = node.props as { children?: unknown; href?: unknown }
    return `${typeof props.href === "string" ? props.href : ""} ${pageText(props.children)}`
  }
  return ""
}

const POSTED_INVOICE = {
  id: 26,
  documentNo: "009/INV/IRO/10/2026",
  status: "posted",
  grandTotal: "1500000",
  paidAmount: "0",
  customer: { name: "Toko Maju" },
}

describe("halaman pembayaran/tambah membaca segmen faktur/<slug>", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.redirectMock.mockImplementation((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`)
    })
    mocks.notFoundMock.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND")
    })
    mocks.prismaMock.salesInvoice.findMany.mockResolvedValue([POSTED_INVOICE])
    mocks.prismaMock.salesInvoice.findFirst.mockResolvedValue({
      id: 26,
      slug: "009-inv-iro-10-2026",
      documentNo: "009/INV/IRO/10/2026",
      status: "posted",
    })
    mocks.prismaMock.salesInvoice.findUnique.mockResolvedValue({ slug: "009-inv-iro-10-2026" })
    mocks.prismaMock.account.findMany.mockResolvedValue([])
    mocks.prismaMock.withholdingTaxType.findMany.mockResolvedValue([])
  })

  const render = (segments?: string[], search: { invoiceId?: string } = {}) =>
    CreatePaymentPage({
      params: Promise.resolve({ segments }),
      searchParams: Promise.resolve(search),
    })

  it("hanya memuat faktur yang bisa dibayar (posted/partial)", async () => {
    await render(undefined)

    const where = mocks.prismaMock.salesInvoice.findMany.mock.calls[0][0].where
    expect(where.status.in).toEqual(["posted", "partial"])
  })

  it("faktur/<slug> faktur posted terpilih otomatis di form", async () => {
    const page = await render(["faktur", "009-inv-iro-10-2026"])
    const form = findElement(page, PaymentForm)

    expect(form).not.toBeNull()
    expect(form.props.defaultInvoiceId).toBe(26)
    expect(form.props.invoices.map((i: { id: number }) => i.id)).toContain(26)
    expect(pageText(page).includes("belum bisa dibayar")).toBe(false)
    // Resolusi memakai slug yang sama dengan URL detail faktur.
    const where = mocks.prismaMock.salesInvoice.findFirst.mock.calls[0][0].where
    expect(where.OR[0]).toEqual({ slug: "009-inv-iro-10-2026" })
  })

  it("faktur/<slug> faktur konsep dijelaskan statusnya, bukan form kosong diam-diam", async () => {
    mocks.prismaMock.salesInvoice.findMany.mockResolvedValue([])
    mocks.prismaMock.salesInvoice.findFirst.mockResolvedValue({
      id: 26,
      slug: "009-inv-iro-10-2026",
      documentNo: "009/INV/IRO/10/2026",
      status: "draft",
    })

    const page = await render(["faktur", "009-inv-iro-10-2026"])
    const form = findElement(page, PaymentForm)
    const text = pageText(page)

    expect(form.props.defaultInvoiceId).toBeUndefined()
    expect(text.includes("belum bisa dibayar")).toBe(true)
    expect(text.includes("Konsep")).toBe(true)
    expect(text.includes("/penjualan/faktur/009-inv-iro-10-2026")).toBe(true)
  })

  it("tanpa segmen tidak ada banner dan tidak ada pilihan awal", async () => {
    const page = await render(undefined)
    const form = findElement(page, PaymentForm)

    expect(form.props.defaultInvoiceId).toBeUndefined()
    expect(mocks.prismaMock.salesInvoice.findFirst).not.toHaveBeenCalled()
    expect(pageText(page).includes("belum bisa dibayar")).toBe(false)
  })

  it("tautan lama ?invoiceId= diarahkan ke bentuk path berslug", async () => {
    await expect(render(undefined, { invoiceId: "26" })).rejects.toThrow(
      "NEXT_REDIRECT:/penjualan/pembayaran/tambah/faktur/009-inv-iro-10-2026",
    )
  })

  it("id numerik memantul ke URL slug kanonis", async () => {
    await expect(render(["faktur", "26"])).rejects.toThrow(
      "NEXT_REDIRECT:/penjualan/pembayaran/tambah/faktur/009-inv-iro-10-2026",
    )
  })

  it("awalan slug yang unik (009) memantul ke slug utuh", async () => {
    mocks.prismaMock.salesInvoice.findFirst.mockResolvedValue(null)
    mocks.prismaMock.salesInvoice.findMany.mockResolvedValue([{ slug: "009-inv-iro-10-2026" }])

    await expect(render(["faktur", "009"])).rejects.toThrow(
      "NEXT_REDIRECT:/penjualan/pembayaran/tambah/faktur/009-inv-iro-10-2026",
    )
  })

  it("segmen rusak dianggap URL salah (404)", async () => {
    mocks.prismaMock.salesInvoice.findFirst.mockResolvedValue(null)
    mocks.prismaMock.salesInvoice.findMany.mockResolvedValue([])
    await expect(render(["faktur"])).rejects.toThrow("NEXT_NOT_FOUND")
    await expect(render(["faktur", "tidak-ada"])).rejects.toThrow("NEXT_NOT_FOUND")
    await expect(render(["penawaran", "009-inv-iro-10-2026"])).rejects.toThrow("NEXT_NOT_FOUND")
  })
})

describe("tombol Terima Pembayaran di detail faktur", () => {
  it("hanya ditawarkan untuk faktur posted/partial, sama seperti gerbang server", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/(dashboard)/penjualan/faktur/[slug]/page.tsx"),
      "utf8",
    )

    // Tombol header dan tombol tab Pembayaran memakai syarat yang sama;
    // syarat lama (`!== paid && !== cancelled`) menawarkan pembayaran untuk
    // faktur konsep yang pasti ditolak form dan server. Tautannya memakai
    // segmen path `tambah/faktur/<id>`, bukan query `?invoiceId=`.
    const offers = source.match(/pembayaran\/tambah\/faktur\//g) ?? []
    expect(offers.length).toBe(2)
    expect(source).not.toMatch(/pembayaran\/tambah\?invoiceId=/)
    expect(source).not.toMatch(/invoice\.status !== "paid" && invoice\.status !== "cancelled"/)
    expect(source.match(/invoice\.status === "posted" \|\| invoice\.status === "partial"/g)?.length).toBeGreaterThanOrEqual(2)
  })

  it("tidak menumpuk Setujui generik di atas Posting", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/(dashboard)/penjualan/faktur/[slug]/page.tsx"),
      "utf8",
    )

    // <StatusActions> (Setujui/Tolak via /api/workflow) hanya membalik status
    // faktur tanpa efek domain, sedangkan postInvoice menerima draft
    // langsung — menampilkannya lagi berarti dua aksi maju yang tumpang
    // tindih. Posting adalah satu-satunya aksi maju faktur konsep.
    expect(source).not.toMatch(/<StatusActions\s+status=/)
    expect(source).not.toMatch(/from "@\/components\/ui\/status-actions"/)
    expect(source).toMatch(/action=\{postInvoice\}/)
    expect(source).toMatch(/\["draft", "approved"\]\.includes\(invoice\.status\)/)
    // Status tetap terlihat, sebagai chip di header.
    expect(source).toMatch(/<StatusChip status=\{invoice\.status\} \/>/)
  })
})
