import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { renderToStaticMarkup } from "react-dom/server"

import {
  ProjectRabItemsTab,
  PROJECT_RAB_ITEMS_TAB_LABEL,
  PROJECT_RAB_ITEMS_HEADING,
  PROJECT_RAB_ITEMS_NOTICE,
  PROJECT_RAB_ITEMS_COLUMNS,
} from "../project-rab-items-tab"
import { formatCurrency } from "@/lib/utils/format"

// Regresi PROJ-BR-004 G4 (temuan QA F-1 PR #1249): label lama pada tab items
// proyek ("Bahan & Komponen Fisik Terpakai", kolom "Jml"/"Biaya Satuan"/"Total
// Biaya") adalah salah baca estimasi vs aktual. Sebelum tes ini ada, mengembalikan
// label lama membuat 95 berkas / 409 tes tetap hijau.

const ITEMS = [
  { id: 11, itemId: 3, description: "Busi Iridium", qty: 2, cost: 150_000 },
  { id: 12, itemId: null, description: null, qty: "1", cost: "250000" },
]

function render(items: readonly { id: number; itemId: number | null; description: string | null; qty: unknown; cost: unknown }[]) {
  return renderToStaticMarkup(<ProjectRabItemsTab items={items} />)
}

describe("ProjectRabItemsTab (PROJ-BR-004 G4)", () => {
  it("memakai kata rencana/RAB pada label tab, judul tabel, dan kolom", () => {
    expect(PROJECT_RAB_ITEMS_TAB_LABEL).toBe("Rencana Bahan & Komponen (RAB)")
    expect(PROJECT_RAB_ITEMS_HEADING).toBe("Rencana Bahan & Komponen (RAB)")
    expect(PROJECT_RAB_ITEMS_COLUMNS).toEqual({
      description: "Deskripsi / Material",
      qty: "Jml Rencana",
      unitCost: "Biaya Satuan Rencana",
      total: "Total Rencana",
    })

    const html = render(ITEMS)
    for (const value of Object.values(PROJECT_RAB_ITEMS_COLUMNS)) {
      expect(html).toContain(value)
    }
    expect(html).toContain(PROJECT_RAB_ITEMS_HEADING.replace("&", "&amp;"))
  })

  it("tidak pernah menyiratkan bahan fisik terpakai atau biaya aktual", () => {
    const html = render(ITEMS)
    for (const forbidden of ["Fisik Terpakai", "fisik terpakai</h2>", ">Jml<", ">Biaya Satuan<", ">Total Biaya<"]) {
      expect(html).not.toContain(forbidden)
    }
    // Penafian yang benar justru harus tampil, supaya "bukan fisik terpakai" tidak
    // hilang diam-diam saat label disunting lagi.
    expect(html).toContain(PROJECT_RAB_ITEMS_NOTICE)
    expect(PROJECT_RAB_ITEMS_NOTICE).toContain("bukan bahan fisik terpakai")
  })

  it("merender baris RAB dengan angka rencana apa adanya", () => {
    const html = render(ITEMS)
    expect(html).toContain("Busi Iridium")
    expect(html).toContain("Item #null") // baris tanpa deskripsi jatuh ke penanda item
    expect(html).toContain(formatCurrency(150_000))
    expect(html).toContain(formatCurrency(2 * 150_000))
    expect(html).toContain(formatCurrency(250_000))
  })

  it("menampilkan keadaan kosong tanpa tabel saat proyek belum punya baris RAB", () => {
    const html = render([])
    expect(html).toContain("Tidak ada item")
    expect(html).not.toContain(PROJECT_RAB_ITEMS_COLUMNS.unitCost)
  })

  it("halaman detail proyek memakai label & komponen itu, bukan label lama", () => {
    const page = readFileSync("src/app/(dashboard)/proyek/[slug]/page.tsx", "utf8")
    expect(page).toContain("PROJECT_RAB_ITEMS_TAB_LABEL")
    expect(page).toContain("<ProjectRabItemsTab items={project.items} />")
    // Label lama tidak boleh kembali ditulis langsung di halaman.
    expect(page).not.toContain("Bahan & Komponen Fisik Terpakai")
    expect(page).not.toContain('label: "Bahan & Komponen"')
  })
})
