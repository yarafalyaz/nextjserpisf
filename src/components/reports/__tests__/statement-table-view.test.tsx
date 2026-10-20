// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot } from "react-dom/client"
import { act } from "react"

import { StatementTableView } from "../statement-table-view"
import { buildBalanceSheetTable } from "@/lib/reports/statement-table"

function render(node: React.ReactNode) {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(node)
  })
  return container
}

afterEach(() => {
  document.body.replaceChildren()
})

describe("StatementTableView drill-down F-2026-10-20-30/31", () => {
  it("nama akun berslug jadi tautan Buku Besar; tanpa slug teks polos", () => {
    const table = buildBalanceSheetTable({
      asOfLabel: "31 Okt 2026",
      assetRows: [
        { id: 1, slug: "kas", code: "1-100", name: "Kas", balance: 1000, level: 0, hasChildren: false },
        { id: 2, slug: null, code: "1-200", name: "Tanpa Slug", balance: 500, level: 0, hasChildren: false },
      ],
      liabilityRows: [],
      equityRows: [],
      totalAssets: 1500,
      totalLiabilities: 0,
      totalEquity: 0,
      isBalanced: false,
      lineLink: { basePath: "/laporan/buku-besar", periodSlug: "2026-10" },
    })
    const container = render(<StatementTableView table={table} tableLabel="Neraca" />)
    const link = container.querySelector('a[href="/laporan/buku-besar/2026-10/akun/kas"]')
    expect(link?.textContent).toBe("Kas")
    expect(link?.getAttribute("aria-label")).toBe("Lihat Buku Besar Kas")
    expect(container.textContent).toContain("Tanpa Slug")
    expect(container.querySelectorAll("a")).toHaveLength(1)
  })
})
