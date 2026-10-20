
import { describe, it, expect, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { TableMobileCards } from "../table-mobile-cards"

function fakeRow(selectableChecked = false) {
  const cell = {
    id: "r1_name", column: { id: "name", columnDef: { header: "Nama", cell: () => "Busi Iridium", meta: {} } },
    getValue: () => "Busi Iridium", getContext: () => ({}),
  }
  return {
    id: "r1", original: { id: 7 }, getIsSelected: () => selectableChecked, toggleSelected: vi.fn(),
    getVisibleCells: () => [cell],
  } as never
}

describe("TableMobileCards touch target", () => {
  it("checkbox kartu mobile dibungkus target sentuh 44px (p-3.5 + -m-3.5 di kotak 16px)", () => {
    const html = renderToStaticMarkup(<TableMobileCards rows={[fakeRow()]} selectable />)
    expect(html).toContain("-m-3.5")
    expect(html).toContain("p-3.5")
    expect(html).toContain('aria-label="Pilih baris 7"')
  })
  it("tanpa selectable tidak ada checkbox", () => {
    const html = renderToStaticMarkup(<TableMobileCards rows={[fakeRow()]} />)
    expect(html).not.toContain("Pilih baris")
  })
})
