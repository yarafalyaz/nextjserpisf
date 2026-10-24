// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"

const exportAction = vi.fn()
vi.mock("@/actions/tax-documents.actions", () => ({
  exportCoretaxOutputXmlAction: (fd: FormData) => exportAction(fd),
}))

vi.mock("@/lib/utils/toast", () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}))

import { CoretaxExportPanel } from "../coretax-export-panel"
import { showError, showSuccess } from "@/lib/utils/toast"
import type { TaxOption } from "../tax-doc-submit"

const INVOICES: TaxOption[] = [
  { value: "7", label: "010.000-26.00000007 — Keluaran — PT Uji (Rp110.000)" },
  { value: "9", label: "010.000-26.00000009 — Keluaran — CV Contoh (Rp220.000)" },
]

function mount(node: React.ReactNode): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(node)
  })
  return { container, root }
}

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })
}

function checkAndExport(container: HTMLDivElement) {
  const box = container.querySelector<HTMLInputElement>("#coretax-export-7")
  expect(box).not.toBeNull()
  act(() => {
    box!.click()
  })
  const btn = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Bentuk & Unduh"))
  expect(btn).toBeDefined()
  act(() => {
    btn!.click()
  })
}

describe("CoretaxExportPanel F-2026-10-23-113-V", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // jsdom: stub unduh berkas
    URL.createObjectURL = vi.fn(() => "blob:uji")
    URL.revokeObjectURL = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
  })

  it("daftar kosong: panel tidak dirender", () => {
    const { container, root } = mount(<CoretaxExportPanel invoices={[]} />)
    expect(container.textContent?.trim()).toBe("")
    act(() => root.unmount())
  })

  it("ekspor sukses: unduh XML + label verbatim + rejections apa adanya", async () => {
    exportAction.mockResolvedValue({
      success: true,
      xml: "<TaxInvoiceBulk/>",
      xmlHash: "abc",
      templateVersion: "v1",
      exportedIds: [7],
      rejections: [
        { taxInvoiceId: 9, code: "MISSING_SELLER_IDTKU", reason: "Faktur #9: NITKU penjual (SellerIDTKU) belum tersedia" },
      ],
      readyLabel: "siap impor Coretax",
      fileCreatedLabel: "berkas XML dibentuk",
    })
    const { container, root } = mount(<CoretaxExportPanel invoices={INVOICES} />)
    checkAndExport(container)
    await flush()
    expect(exportAction).toHaveBeenCalledTimes(1)
    const fd = exportAction.mock.calls[0][0] as FormData
    expect(fd.get("taxInvoiceIds")).toBe("7")
    expect(showSuccess).toHaveBeenCalledWith("berkas XML dibentuk")
    expect(container.textContent).toContain("siap impor Coretax")
    expect(container.textContent).toContain("berkas XML dibentuk")
    expect(container.textContent).toContain("MISSING_SELLER_IDTKU")
    expect(container.textContent).toContain("Faktur #9: NITKU penjual (SellerIDTKU) belum tersedia")
    expect(container.textContent).not.toContain("telah terkirim")
    expect(container.textContent).not.toContain("sudah disetujui")
    act(() => root.unmount())
  })

  it("semua tertolak (xml null): tanpa unduh, alasan tampil apa adanya", async () => {
    exportAction.mockResolvedValue({
      success: true,
      xml: null,
      xmlHash: null,
      templateVersion: "v1",
      exportedIds: [],
      rejections: [
        { taxInvoiceId: 7, code: "MISSING_SELLER_IDTKU", reason: "Faktur #7: NITKU penjual (SellerIDTKU) belum tersedia" },
      ],
      readyLabel: "siap impor Coretax",
      fileCreatedLabel: null,
    })
    const { container, root } = mount(<CoretaxExportPanel invoices={INVOICES} />)
    checkAndExport(container)
    await flush()
    expect(showSuccess).not.toHaveBeenCalled()
    expect(container.textContent).toContain("MISSING_SELLER_IDTKU")
    act(() => root.unmount())
  })

  it("gagal validasi: error server verbatim lewat toast", async () => {
    exportAction.mockResolvedValue({ success: false, error: "Pilih minimal satu faktur pajak keluaran" })
    const { container, root } = mount(<CoretaxExportPanel invoices={INVOICES} />)
    checkAndExport(container)
    await flush()
    expect(showError).toHaveBeenCalledWith("Pilih minimal satu faktur pajak keluaran")
    act(() => root.unmount())
  })
})
