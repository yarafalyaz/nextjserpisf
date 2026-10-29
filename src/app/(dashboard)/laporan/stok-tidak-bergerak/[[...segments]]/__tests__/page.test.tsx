// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  loadSlowMovingStock: vi.fn(),
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: mocks.requirePermission,
}))

vi.mock("@/lib/reports/slow-moving-stock-data", () => ({
  loadSlowMovingStock: mocks.loadSlowMovingStock,
}))

vi.mock("next/navigation", () => ({
  useRouter() {
    return { refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn() }
  },
  usePathname() {
    return "/laporan/stok-tidak-bergerak"
  },
  useSearchParams() {
    return new URLSearchParams()
  },
}))

// ReportPageShell memuat ReportSheet async (settings DB) — di luar unit ini.
vi.mock("@/components/reports/report-page-shell", () => ({
  ReportPageShell: ({
    children,
    filter,
  }: {
    children: React.ReactNode
    filter?: React.ReactNode
  }) => (
    <div>
      {filter}
      {children}
    </div>
  ),
}))

vi.mock("@/components/reports/export-buttons", () => ({
  ExportButtons: () => null,
}))

// ReportLetterhead memanggil auth() (next-auth) — di luar unit ini.
vi.mock("@/components/reports/report-letterhead", () => ({
  ReportLetterhead: ({ title }: { title: string }) => <h1>{title}</h1>,
}))

import SlowMovingStockPage from "../page"
import {
  buildSlowMovingStock,
  slowMovingSummary,
} from "@/lib/reports/slow-moving-stock"

const AS_OF = new Date(2026, 9, 22)

function fixtureReport() {
  const report = buildSlowMovingStock({
    asOf: AS_OF,
    thresholdDays: 90,
    items: [
      {
        sku: "BRG-001",
        name: "Oli Mesin 1L",
        categoryName: "Pelumas",
        unit: "botol",
        remainingQty: 12,
        remainingValue: 600_000,
        lastOutDate: new Date(2026, 0, 10),
      },
      {
        sku: "BRG-002",
        name: "Filter Udara",
        categoryName: "Filter",
        unit: "pcs",
        remainingQty: 5,
        remainingValue: 250_000,
        lastOutDate: null,
      },
      {
        sku: "BRG-003",
        name: "Kampas Rem",
        categoryName: "Rem",
        unit: "set",
        remainingQty: 8,
        remainingValue: 400_000,
        lastOutDate: new Date(2026, 9, 1),
      },
    ],
  })
  return { report, periodLabel: "Periode 22 Okt 2026 – 22 Okt 2026", periodCaption: "Periode 22 Okt 2026 – 22 Okt 2026", thresholdDays: 90 }
}

async function renderPage(search: { ambang?: string } = {}, segments: string[] = []) {
  const node = await SlowMovingStockPage({
    params: Promise.resolve({ segments }),
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

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue({ name: "Uji", email: "uji@contoh.id" })
  mocks.loadSlowMovingStock.mockResolvedValue(fixtureReport())
})

afterEach(() => {
  document.body.replaceChildren()
})

describe("halaman stok tidak bergerak (pasangan UI PR #462)", () => {
  it("gerbang view_reports sebelum loader; tanpa izin loader tidak dipanggil", async () => {
    const { root } = await renderPage()
    expect(mocks.requirePermission).toHaveBeenCalledWith("view_reports")
    expect(mocks.loadSlowMovingStock).toHaveBeenCalledTimes(1)
    act(() => root.unmount())

    mocks.requirePermission.mockRejectedValue(new Error("redirect:/"))
    await expect(
      SlowMovingStockPage({ params: Promise.resolve({ segments: [] }), searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("redirect:/")
    expect(mocks.loadSlowMovingStock).toHaveBeenCalledTimes(1)
  })

  it("ambang dari path (/ambang/30) dibaca — bukan reset ke default", async () => {
    const { root } = await renderPage({}, ["ambang", "30"])
    expect(mocks.loadSlowMovingStock).toHaveBeenCalledWith(
      expect.objectContaining({ thresholdDays: 30 }),
    )
    act(() => root.unmount())
    // Query lama tetap fallback bila path kosong.
    await renderPage({ ambang: "7" }, [])
    expect(mocks.loadSlowMovingStock).toHaveBeenLastCalledWith(
      expect.objectContaining({ thresholdDays: 7 }),
    )
  })

  it("tampilkan baris builder apa adanya: barang lambat tampil, bergerak tidak", async () => {
    const { container, root } = await renderPage()
    const text = container.textContent ?? ""
    // Kolom builder: Barang/Kategori/Sisa/Satuan/Keluar Terakhir/Nilai Sisa.
    expect(text).toContain("BRG-001 Oli Mesin 1L")
    expect(text).toContain("Belum pernah keluar")
    expect(text).toContain("(285 hari)")
    expect(text).toContain("Rp 850.000")
    // Barang bergerak dalam ambang (21 hari) tidak masuk daftar.
    expect(text).not.toContain("Kampas Rem")
    // Kontrak agregat per barang: tidak ada kolom gudang karangan UI.
    expect(text).not.toContain("Gudang")
    act(() => root.unmount())
  })

  it("verdict + ringkasan builder tampil verbatim; KPI dari totals loader", async () => {
    const fixture = fixtureReport()
    const { container, root } = await renderPage()
    const text = container.textContent ?? ""
    expect(text).toContain(fixture.report.verdict)
    expect(text).toContain(slowMovingSummary(fixture.report))
    expect(text).toContain("Barang Dinilai")
    expect(text).toContain("Belum Pernah Keluar")
    act(() => root.unmount())
  })

  it("ambang valid diteruskan ke loader; ambang rusak jatuh ke baku loader", async () => {
    const { root } = await renderPage({ ambang: "30" })
    expect(mocks.loadSlowMovingStock).toHaveBeenCalledWith(
      expect.objectContaining({ thresholdDays: 30 }),
    )
    act(() => root.unmount())

    const { root: root2 } = await renderPage({ ambang: "abc" })
    expect(mocks.loadSlowMovingStock).toHaveBeenLastCalledWith(
      expect.objectContaining({ thresholdDays: undefined }),
    )
    act(() => root2.unmount())
  })

  it("kontrak statis: page pakai loader kanonis, tanpa prisma/hitung ulang", () => {
    const page = readFileSync(
      resolve(
        process.cwd(),
        "src/app/(dashboard)/laporan/stok-tidak-bergerak/[[...segments]]/page.tsx",
      ),
      "utf8",
    )
    expect(page).toContain("loadSlowMovingStock")
    expect(page).not.toContain("@/lib/db/prisma")
    expect(page).not.toContain("buildSlowMovingStock(")
  })
})
