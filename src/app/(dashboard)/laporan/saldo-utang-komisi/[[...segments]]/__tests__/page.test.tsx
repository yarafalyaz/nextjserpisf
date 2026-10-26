// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"

const mocks = vi.hoisted(() => ({
  izin: vi.fn(),
  muatSaldo: vi.fn(),
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: mocks.izin,
}))

vi.mock("@/lib/reports/sales-commission-payable-data", () => ({
  getSalesCommissionPayable: mocks.muatSaldo,
}))

vi.mock("next/navigation", () => ({
  useRouter() {
    return { refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn() }
  },
}))

// ReportPageShell memuat ReportSheet async (settings DB) — di luar unit ini.
vi.mock("@/components/reports/report-page-shell", () => ({
  ReportPageShell: (props: { children: React.ReactNode; title: string }) => (
    <div>
      <h1>{props.title}</h1>
      {props.children}
    </div>
  ),
}))

vi.mock("@/components/reports/export-buttons", () => ({
  ExportButtons: () => null,
}))

import SalesCommissionPayablePage from "../page"
import { buildSalesCommissionPayable } from "@/lib/reports/sales-commission-payable"

const PAYABLE_LIVE = buildSalesCommissionPayable(
  [
    {
      salesInvoiceId: 10,
      salesEmployeeId: 2,
      salesEmployeeName: "Sari",
      accruedAmount: 100000,
      reversalAmount: 25000,
      paidAmount: 50000,
    },
  ],
  { ledgerAvailable: true },
)

const PAYABLE_BELUM_LIVE = buildSalesCommissionPayable([], { ledgerAvailable: false })

async function renderPayablePage() {
  const node = await SalesCommissionPayablePage()
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  act(() => {
    root.render(node)
  })
  return { container, root }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.izin.mockResolvedValue(undefined)
})

afterEach(() => {
  document.body.replaceChildren()
})

describe("F-2026-10-25-037-S §5 halaman saldo utang komisi", () => {
  it("gerbang view_reports dipanggil sebelum loader saldo", async () => {
    mocks.muatSaldo.mockResolvedValue(PAYABLE_LIVE)
    const { root } = await renderPayablePage()
    expect(mocks.izin).toHaveBeenCalledWith("view_reports")
    expect(mocks.muatSaldo).toHaveBeenCalledTimes(1)
    act(() => root.unmount())
  })

  it("tanpa izin loader tidak dipanggil sama sekali", async () => {
    mocks.izin.mockRejectedValue(new Error("redirect:/"))
    await expect(SalesCommissionPayablePage()).rejects.toThrow("redirect:/")
    expect(mocks.muatSaldo).not.toHaveBeenCalled()
  })

  it("ledger live: judul + angka builder tampil verbatim di halaman", async () => {
    mocks.muatSaldo.mockResolvedValue(PAYABLE_LIVE)
    const { container, root } = await renderPayablePage()
    const text = container.textContent ?? ""
    expect(text).toContain("Saldo Utang Komisi Penjualan")
    expect(text).toContain("Sari")
    expect(text).toContain("Rp 25.000")
    act(() => root.unmount())
  })

  it("ledger belum live: label belum-tersedia verbatim, bukan saldo rekap", async () => {
    mocks.muatSaldo.mockResolvedValue(PAYABLE_BELUM_LIVE)
    const { container, root } = await renderPayablePage()
    const text = container.textContent ?? ""
    expect(text).toContain(
      "Subledger dan jurnal utang komisi belum tersedia (inti tahap 3 belum live) — saldo utang komisi terbaca 0; rekap informatif tetap bukan utang.",
    )
    expect(container.querySelector("table")).toBeNull()
    act(() => root.unmount())
  })

  it("kontrak statis: halaman konsumen loader saja, tanpa Prisma/hitung ulang", () => {
    const pageSource = readFileSync(
      resolve(process.cwd(), "src/app/(dashboard)/laporan/saldo-utang-komisi/[[...segments]]/page.tsx"),
      "utf8",
    )
    expect(pageSource).toContain("getSalesCommissionPayable")
    expect(pageSource).toContain('requirePermission("view_reports")')
    expect(pageSource).not.toContain("prisma.")
    expect(pageSource).not.toContain("getSalesCommissionRecap")
  })
})
