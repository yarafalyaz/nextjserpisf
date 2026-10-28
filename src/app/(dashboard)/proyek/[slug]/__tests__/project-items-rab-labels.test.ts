import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"

/**
 * PROJ-BR-004 G4 — penjaga label tab "items" detail proyek.
 *
 * `project.items` di halaman detail proyek = baris RAB (ProjectItem qty × cost
 * rencana), BUKAN material fisik terpakai. Label lama ("Bahan & Komponen
 * Fisik Terpakai" / kolom "Total Biaya") menyiratkan biaya AKTUAL dan adalah
 * risiko salah-baca tertinggi pada fitur ini — biaya material aktual hanya
 * diakui dari MaterialIssue completed di Laba Rugi Proyek.
 *
 * Halaman ini server component (requirePermission + Prisma), jadi tidak
 * dirender langsung; penjaga membaca sumber seperti konvensi repo
 * (work-order-detail-handover.test.ts, sales-return-approve-gate.test.ts).
 * Mengembalikan label lama pada tab/judul/kolom wajib memerahkan tes ini.
 */
const PAGE_SOURCE = path.join(
  process.cwd(),
  "src/app/(dashboard)/proyek/[slug]/page.tsx",
)
const source = readFileSync(PAGE_SOURCE, "utf8")

/** Potong blok satu tab (dari `id: "<id>"` sampai tab berikutnya). */
function tabBlock(sourceText: string, tabId: string): string {
  const marker = `id: "${tabId}"`
  const start = sourceText.indexOf(marker)
  if (start === -1) throw new Error(`tab "${tabId}" tidak ditemukan di page.tsx`)
  const rest = sourceText.slice(start + marker.length)
  const nextTab = rest.search(/\n\s*id: "/)
  return nextTab === -1 ? rest : rest.slice(0, nextTab)
}

describe("PROJ-BR-004 G4 — tab items detail proyek berlabel Rencana (RAB)", () => {
  const itemsTab = tabBlock(source, "items")

  it("label tab menyebut Rencana (RAB), bukan label lama 'Bahan & Komponen'", () => {
    expect(itemsTab).toMatch(/label: "Rencana Bahan & Komponen \(RAB\)"/)
    expect(itemsTab).not.toMatch(/label: "Bahan & Komponen"/)
  })

  it("judul panel menyebut Rencana (RAB) dan tidak memakai frasa 'Fisik Terpakai'", () => {
    expect(itemsTab).toContain("Rencana Bahan &amp; Komponen (RAB)")
    expect(itemsTab).not.toContain("Fisik Terpakai")
    expect(itemsTab).not.toContain("Bahan &amp; Komponen Fisik")
  })

  it("kolom tabel RAB berlabel rencana, tanpa kolom 'Total Biaya' (menyiratkan aktual)", () => {
    expect(itemsTab).toContain("Jml Rencana")
    expect(itemsTab).toContain("Biaya Satuan Rencana")
    expect(itemsTab).toContain("Total Rencana")
    expect(itemsTab).not.toContain("Total Biaya")
    expect(itemsTab).not.toContain("Biaya Satuan<")
    expect(itemsTab).not.toContain(">Jml<")
  })

  it("catatan eksplisit menyatakan baris ini rencana, bukan bahan fisik terpakai", () => {
    expect(itemsTab).toContain("bukan bahan fisik terpakai")
  })

  it("label lama tidak hidup lagi di tab mana pun pada halaman detail proyek", () => {
    expect(source).not.toContain("Fisik Terpakai")
    expect(source).not.toContain("Total Biaya")
    expect(source).not.toMatch(/label: "Bahan & Komponen"/)
  })

  it("tab RAB terpisah tetap ada, jadi baris rencana tidak tertukar dengan ringkasan anggaran", () => {
    expect(tabBlock(source, "budget")).toMatch(/label: "RAB"/)
  })
})
