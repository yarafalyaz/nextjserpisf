import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * Penjaga sambungan Pusat Laba ke jurnal.
 *
 * Mengapa perlu: jalur tulis `JournalEntry.profitCenterId` bergantung pada entri
 * yang dikirim form sebagai JSON. Aksi server tidak bisa melihat cacat di sisi itu —
 * kalau form berhenti menyertakan `profitCenterId`, aksinya tetap hijau (menulis
 * `null`) dan laporan pusat laba kembali kosong tanpa satu pun tes memerah.
 * Pola yang sama sudah terbukti pada checkbox hari kerja (`workDays`).
 */

const ROOT = join(__dirname, "..", "..")
const read = (p: string) => readFileSync(join(ROOT, p), "utf8")

describe("pusat laba tersambung ke jurnal", () => {
  it("form jurnal menyertakan profitCenterId di payload entri", () => {
    const src = read("src/components/forms/journal-form.tsx")
    expect(
      src,
      "Tanpa pemetaan ini, entri dikirim tanpa pusat laba dan aksinya menulis null.",
    ).toContain("profitCenterId: profitCenterId ? Number(profitCenterId) : undefined")
    expect(src).toContain("Pusat Laba")
  })

  it("kedua halaman jurnal memuat master pusat laba dan meneruskannya ke form", () => {
    for (const page of [
      "src/app/(dashboard)/keuangan/jurnal/tambah/page.tsx",
      "src/app/(dashboard)/keuangan/jurnal/[slug]/ubah/page.tsx",
    ]) {
      const src = read(page)
      expect(src, `${page} harus memuat master pusat laba`).toContain("prisma.profitCenter.findMany")
      expect(src, `${page} harus meneruskan profitCenters ke JournalForm`).toMatch(
        /<JournalForm[\s\S]{0,200}profitCenters=\{profitCenters\}/,
      )
    }
  })

  it("aksi jurnal menulis profitCenterId di kedua jalur (buat dan ubah)", () => {
    const src = read("src/actions/finance.actions.ts")
    const matches = src.match(/profitCenterId: entry\.profitCenterId \|\| null/g) ?? []
    expect(
      matches.length,
      "Jalur buat DAN jalur ubah harus menulis pusat laba; kalau hanya satu, " +
        "mengubah jurnal akan menghapus pusat labanya.",
    ).toBeGreaterThanOrEqual(2)
  })
})
