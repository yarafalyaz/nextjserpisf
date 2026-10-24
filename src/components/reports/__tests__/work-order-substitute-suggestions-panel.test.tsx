// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { act } from "react"

const mocks = vi.hoisted(() => ({
  apply: vi.fn(async () => ({ success: true as const, releaseNotice: "Reservasi baris lama dilepas" })),
  showError: vi.fn(),
  showSuccess: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}))

vi.mock("@/actions/item-substitute.actions", () => ({
  applyWorkOrderItemSubstitute: (...args: unknown[]) => mocks.apply(...(args as [])),
  listItemSubstitutes: vi.fn(async () => ({ success: true, substitutes: [] })),
  createItemSubstitute: vi.fn(async () => ({ success: true, id: 1 })),
  setItemSubstituteActive: vi.fn(async () => ({ success: true })),
}))

vi.mock("@/lib/utils/toast", () => ({
  showError: (...args: unknown[]) => mocks.showError(...args),
  showSuccess: (...args: unknown[]) => mocks.showSuccess(...args),
}))

import { WorkOrderSubstituteSuggestionsPanel } from "../work-order-substitute-suggestions-panel"
import type { SubstituteSuggestionReport } from "@/lib/reports/item-substitute-suggestions"
import { ITEM_SUBSTITUTE_SUGGESTION_NOTICE } from "@/lib/reports/item-substitute-suggestions"
import { renderCard, unmountCard, clickButtonByText, setFieldValue } from "./card-test-utils"

afterEach(() => {
  document.body.replaceChildren()
  vi.clearAllMocks()
})

function report(extra: Partial<SubstituteSuggestionReport["rows"][number]["suggestions"][number]> = {}): SubstituteSuggestionReport {
  return {
    notice: ITEM_SUBSTITUTE_SUGGESTION_NOTICE,
    suggestedLineCount: 1,
    rows: [
      {
        workOrderItemId: 11,
        itemId: 100,
        description: "Kampas Rem Depan",
        qty: 2,
        partStatus: "menunggu",
        issuedQty: 0,
        shortageQty: 2,
        suggestions: [
          {
            substituteId: 5,
            substituteItemId: 200,
            substituteName: "Kampas Rem Alternatif",
            substituteSku: "KB-ALT",
            substituteUnitOfMeasure: "pcs",
            notes: "setara fungsi",
            effectiveAvailableQty: 7,
            substituteShortage: false,
            fitment: "compatible",
            fitmentReason: "Cocok untuk kendaraan ini",
            rejected: false,
            ...extra,
          },
        ],
      },
      {
        workOrderItemId: 12,
        itemId: 101,
        description: "Baut Roda",
        qty: 4,
        partStatus: "terpasang",
        issuedQty: 4,
        shortageQty: 0,
        suggestions: [],
      },
    ],
  }
}

function render(props: Partial<React.ComponentProps<typeof WorkOrderSubstituteSuggestionsPanel>> = {}) {
  return renderToStaticMarkup(
    <WorkOrderSubstituteSuggestionsPanel workOrderId={9} report={report()} canApply {...props} />,
  )
}

describe("WorkOrderSubstituteSuggestionsPanel F-2026-10-22-069-S", () => {
  it("tanpa baris bersaran: panel senyap (null)", () => {
    const empty: SubstituteSuggestionReport = { notice: "x", suggestedLineCount: 0, rows: [] }
    expect(
      renderToStaticMarkup(
        <WorkOrderSubstituteSuggestionsPanel workOrderId={9} report={empty} canApply />,
      ),
    ).toBe("")
  })

  it("AC-SUB69-6: penanda Ada substitusi + stok efektif + status label server + notice verbatim", () => {
    const html = render()
    expect(html).toContain("Saran Substitusi Part")
    expect(html).toContain("Ada substitusi")
    expect(html).toContain("Kampas Rem Alternatif")
    expect(html).toContain("7 pcs")
    expect(html).toContain("Menunggu")
    expect(html).toContain(ITEM_SUBSTITUTE_SUGGESTION_NOTICE)
    expect(html).toContain("Pakai Substitusi")
    expect(html).not.toContain("Baut Roda")
  })

  it("AC-SUB69-7: incompatible tampil Ditolak + alasan verbatim + tombol nonaktif", () => {
    const html = render({
      report: report({
        fitment: "incompatible",
        fitmentReason: "Tidak cocok untuk konfigurasi kendaraan ini",
        rejected: true,
      }),
    })
    expect(html).toContain("Ditolak")
    expect(html).toContain("Tidak cocok untuk konfigurasi kendaraan ini")
    expect(html).toContain("disabled")
  })

  it("tanpa edit_work_orders: tombol Pakai Substitusi tidak tampil, penjelasan tampil", () => {
    const html = render({ canApply: false })
    expect(html).not.toContain(">Pakai Substitusi<")
    expect(html).toContain("Hanya pengguna berizin edit_work_orders")
  })

  it("stok pengganti kurang tampil apa adanya", () => {
    const html = render({ report: report({ substituteShortage: true, effectiveAvailableQty: 1 }) })
    expect(html).toContain("Stok pengganti juga kurang")
    expect(html).toContain("1 pcs")
  })

  it("submit: alasan wajib; sukses panggil aksi dengan qty default tersirat + releaseNotice tampil", async () => {
    const { container, root } = renderCard(
      <WorkOrderSubstituteSuggestionsPanel workOrderId={9} report={report()} canApply />,
    )
    act(() => {
      clickButtonByText(container, "Pakai Substitusi")
    })
    // tombol submit di panel inline nonaktif sebelum alasan terisi
    const submitBtn = [...container.querySelectorAll("button")].filter(
      (b) => b.textContent === "Pakai Substitusi",
    ).at(-1)!
    expect(submitBtn.hasAttribute("disabled")).toBe(true)
    act(() => {
      setFieldValue(container, "#substitute-reason", "Stok asal kosong")
    })
    await act(async () => {
      submitBtn.click()
    })
    expect(mocks.apply).toHaveBeenCalledWith({
      workOrderId: 9,
      workOrderItemId: 11,
      substituteItemId: 200,
      reason: "Stok asal kosong",
    })
    expect(mocks.showSuccess).toHaveBeenCalledWith("Reservasi baris lama dilepas")
    unmountCard(root)
  })
})
