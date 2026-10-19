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

const badanFungsi = (src: string, nama: string) => {
  const mulai = src.indexOf(`export async function ${nama}`)
  expect(mulai, `Fungsi ${nama} harus ada di aksi jurnal`).toBeGreaterThanOrEqual(0)
  const sisa = src.slice(mulai)
  const berikut = sisa.slice(1).search(/\nexport async function /)
  return berikut === -1 ? sisa : sisa.slice(0, berikut + 1)
}

const badanHelper = (src: string) => {
  const cocok = src.match(
    /function journalEntryRows\(journalId: number, validEntries: JournalEntryInput\[\]\) \{([\s\S]*?)\n\}/,
  )
  expect(
    cocok,
    "Helper journalEntryRows(journalId, validEntries) harus ada agar jalur buat dan ubah berbagi pemetaan baris jurnal",
  ).not.toBeNull()
  return cocok?.[1] ?? ""
}

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
    // Baris kini hidup satu kali di helper bersama; kontrak dipindah ke helper,
    // dan kedua jalur wajib benar-benar memanggil helper itu.
    const src = read("src/actions/finance.actions.ts")
    const helper = badanHelper(src)
    const matches = helper.match(/profitCenterId: entry\.profitCenterId \|\| null/g) ?? []
    expect(
      matches.length,
      "Pemetaan profitCenterId harus muncul tepat satu kali di dalam helper journalEntryRows; " +
        "kalau hilang, jurnal kembali menumpuk di “Tanpa Pusat Laba”.",
    ).toBe(1)
    expect(
      (src.match(/profitCenterId: entry\.profitCenterId \|\| null/g) ?? []).length,
      "Pemetaan profitCenterId tidak boleh kembali diduplikasi di luar helper journalEntryRows",
    ).toBe(1)
    const panggilan =
      src.match(/journalEntryRows\(\s*[^)]*,\s*validEntries\s*\)/g) ?? []
    expect(
      panggilan.length,
      "Jalur buat DAN jalur ubah harus memanggil journalEntryRows dengan validEntries; kalau hanya satu, " +
        "mengubah jurnal akan menghapus pusat labanya.",
    ).toBeGreaterThanOrEqual(2)
    expect(
      badanFungsi(src, "createJournal"),
      "Jalur buat (createJournal) harus memanggil journalEntryRows dengan validEntries",
    ).toMatch(/journalEntryRows\(\s*[^)]*,\s*validEntries\s*\)/)
    expect(
      badanFungsi(src, "updateJournal"),
      "Jalur ubah (updateJournal) harus memanggil journalEntryRows dengan validEntries",
    ).toMatch(/journalEntryRows\(\s*[^)]*,\s*validEntries\s*\)/)
  })
})
