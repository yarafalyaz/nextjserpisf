// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  getSalesCommissionRecap: vi.fn(),
  getSalesCommissionSubledgerRecap: vi.fn(),
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: mocks.requirePermission,
}))

vi.mock("@/lib/reports/sales-commission-data", () => ({
  getSalesCommissionRecap: mocks.getSalesCommissionRecap,
}))

vi.mock("@/lib/reports/sales-commission-subledger-data", () => ({
  getSalesCommissionSubledgerRecap: mocks.getSalesCommissionSubledgerRecap,
}))

vi.mock("next/navigation", () => ({
  useRouter() {
    return { refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn() }
  },
}))

// ReportPageShell memuat ReportSheet async (settings DB) — di luar unit ini.
vi.mock("@/components/reports/report-page-shell", () => ({
  ReportPageShell: ({ children, filter }: { children: React.ReactNode; filter?: React.ReactNode }) => (
    <div>
      {filter}
      {children}
    </div>
  ),
}))

vi.mock("@/components/reports/export-buttons", () => ({
  ExportButtons: () => null,
}))

import SalesCommissionPage from "../page"
import { buildSalesCommissionRecap } from "@/lib/reports/sales-commission"
import { buildSalesCommissionSubledger } from "@/lib/reports/sales-commission-subledger"
import { buildSalesCommissionPayable } from "@/lib/reports/sales-commission-payable"

function source(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8")
}

async function renderPage(search: Record<string, string> = {}) {
  const node = await SalesCommissionPage({
    params: Promise.resolve({ segments: [] }),
    searchParams: Promise.resolve(search),
  })
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  act(() => {
    root.render(node)
  })
  return { container, root }
}

const RECAP = buildSalesCommissionRecap([
  { salesEmployeeId: 2, salesEmployeeName: "Sari", grandTotal: 1_250_000, commissionPercent: 0 },
  { salesEmployeeId: 1, salesEmployeeName: "Budi", grandTotal: 500_000, commissionPercent: 0 },
  { salesEmployeeId: null, salesEmployeeName: null, grandTotal: 700_000, commissionPercent: 0 },
])

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue(undefined)
  mocks.getSalesCommissionRecap.mockResolvedValue(RECAP)
  mocks.getSalesCommissionSubledgerRecap.mockResolvedValue({
    payable: buildSalesCommissionPayable([], { ledgerAvailable: false }),
    lineStatuses: [],
  })
})

afterEach(() => {
  document.body.replaceChildren()
})

describe("F-2026-10-22-053-S halaman rekap komisi", () => {
  it("AC-KOM-5: gerbang view_reports dipanggil sebelum loader", async () => {
    const { root } = await renderPage()
    expect(mocks.requirePermission).toHaveBeenCalledWith("view_reports")
    expect(mocks.getSalesCommissionRecap).toHaveBeenCalledTimes(1)
    act(() => root.unmount())
  })

  it("AC-KOM-5: tanpa izin loader tidak dipanggil (requirePermission menolak)", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("redirect:/"))
    await expect(
      SalesCommissionPage({
        params: Promise.resolve({ segments: [] }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("redirect:/")
    expect(mocks.getSalesCommissionRecap).not.toHaveBeenCalled()
  })

  it("AC-KOM-2/4: filter penjual query -> hanya baris itu, total loader utuh", async () => {
    const { container, root } = await renderPage({ penjual: "2" })
    const text = container.textContent ?? ""
    expect(text).toContain("Sari")
    expect(text).not.toContain("Budi")
    expect(text).toContain("Rp 2.450.000")
    act(() => root.unmount())
  })

  it("kontrak statis: page pakai loader existing, tanpa hitung persen/bayar/jurnal", () => {
    const page = source("src/app/(dashboard)/laporan/rekap-komisi/[[...segments]]/page.tsx")
    const card = source("src/components/reports/sales-commission-card.tsx")
    expect(page).toContain("getSalesCommissionRecap")
    expect(page).toContain('requirePermission("view_reports")')
    for (const src of [page, card]) {
      expect(src).not.toMatch(/commissionPercent\s*[*/]/)
      expect(src).not.toMatch(/bayar|posting|jurnal/i)
      expect(src).not.toContain("prisma.")
    }
  })

  it("049-S: tanpa izin kedua loader tidak dipanggil (fail-closed page)", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("redirect:/"))
    await expect(
      SalesCommissionPage({
        params: Promise.resolve({ segments: [] }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("redirect:/")
    expect(mocks.getSalesCommissionRecap).not.toHaveBeenCalled()
    expect(mocks.getSalesCommissionSubledgerRecap).not.toHaveBeenCalled()
  })

  it("049-S: subledger loader dipanggil + notice UNAVAILABLE verbatim tampil (G1 tertutup)", async () => {
    const { container, root } = await renderPage()
    expect(mocks.getSalesCommissionSubledgerRecap).toHaveBeenCalledTimes(1)
    const text = container.textContent ?? ""
    expect(text).toContain("Subledger Komisi per Penerima")
    expect(text).toContain(
      "Subledger dan jurnal utang komisi belum tersedia (inti tahap 3 belum live) — saldo utang komisi terbaca 0; rekap informatif tetap bukan utang.",
    )
    act(() => root.unmount())
  })

  it("049-S: saldo + status baris dari loader tampil verbatim, penerima asing tak bocor", async () => {
    const view = buildSalesCommissionSubledger([
      {
        salesInvoiceId: 101,
        salesEmployeeId: 2,
        salesEmployeeName: "Sari",
        accruedAmount: 1_000_000,
        reversalAmount: 0,
        paidAmount: 400_000,
      },
    ])
    mocks.getSalesCommissionSubledgerRecap.mockResolvedValue(view)
    const { container, root } = await renderPage()
    const text = container.textContent ?? ""
    expect(text).toContain("Rp 600.000")
    expect(text).toContain("Terbayar Sebagian")
    expect(text).not.toContain("Zulkifli")
    act(() => root.unmount())
  })

  it("049-S kontrak statis: kartu subledger tanpa hitung ulang/status turunan lokal", () => {
    const page = source("src/app/(dashboard)/laporan/rekap-komisi/[[...segments]]/page.tsx")
    const card = source("src/components/reports/sales-commission-subledger-card.tsx")
    expect(page).toContain("getSalesCommissionSubledgerRecap")
    expect(card).not.toContain("prisma.")
    expect(card).not.toMatch(/accruedAmount\s*[-+*/]/)
    expect(card).not.toMatch(/deriveStatus|commissionPercent/)
    expect(card).toContain("210212")
    expect(card).not.toContain("210207")
  })
})
