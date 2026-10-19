import { expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = join(__dirname, "..", "..")
export const readSrc = (p: string) => readFileSync(join(ROOT, p), "utf8")
export const JOURNAL_FORM = "src/components/forms/journal-form.tsx"
export const JOURNAL_TAMBAH = "src/app/(dashboard)/keuangan/jurnal/tambah/page.tsx"
export const JOURNAL_UBAH = "src/app/(dashboard)/keuangan/jurnal/[slug]/ubah/page.tsx"
export const JOURNAL_ACTIONS = "src/actions/finance.actions.ts"

export function badanFungsi(src: string, nama: string) {
  const mulai = src.indexOf(`export async function ${nama}`)
  expect(mulai, `Fungsi ${nama} harus ada di aksi jurnal`).toBeGreaterThanOrEqual(0)
  const sisa = src.slice(mulai)
  const berikut = sisa.slice(1).search(/\nexport async function /)
  return berikut === -1 ? sisa : sisa.slice(0, berikut + 1)
}

export function badanHelper(src: string) {
  const cocok = src.match(
    /function journalEntryRows\(journalId: number, validEntries: JournalEntryInput\[\]\) \{([\s\S]*?)\n\}/,
  )
  expect(
    cocok,
    "Helper journalEntryRows(journalId, validEntries) harus ada agar jalur buat dan ubah berbagi pemetaan baris jurnal",
  ).not.toBeNull()
  return cocok?.[1] ?? ""
}

/** Kontrak aksi: pemetaan `field: entry.field || null` tepat sekali di helper, kedua jalur memanggil helper. */
export function expectActionWritesField(src: string, field: string, label: string) {
  const helper = badanHelper(src)
  const pattern = new RegExp(`${field}: entry\\.${field} \\|\\| null`, "g")
  const matches = helper.match(pattern) ?? []
  expect(
    matches.length,
    `Pemetaan ${field} harus muncul tepat satu kali di dalam helper journalEntryRows; ` +
      `kalau hilang, jurnal kembali menumpuk di “Tanpa ${label}”.`,
  ).toBe(1)
  expect(
    (src.match(pattern) ?? []).length,
    `Pemetaan ${field} tidak boleh kembali diduplikasi di luar helper journalEntryRows`,
  ).toBe(1)
  const panggilan = src.match(/journalEntryRows\(\s*[^)]*,\s*validEntries\s*\)/g) ?? []
  expect(
    panggilan.length,
    "Jalur buat DAN jalur ubah harus memanggil journalEntryRows dengan validEntries; kalau hanya satu, " +
      "mengubah jurnal akan menghapus tandanya.",
  ).toBeGreaterThanOrEqual(2)
  for (const fn of ["createJournal", "updateJournal"]) {
    expect(
      badanFungsi(src, fn),
      `Jalur ${fn === "createJournal" ? "buat" : "ubah"} (${fn}) harus memanggil journalEntryRows dengan validEntries`,
    ).toMatch(/journalEntryRows\(\s*[^)]*,\s*validEntries\s*\)/)
  }
}

/** Kontrak halaman: kedua halaman memuat master `prisma.<model>.findMany` dan meneruskan prop ke JournalForm. */
export function expectPagesLoadMaster(read: (p: string) => string, opts: { model: string; prop: string; masterLabel: string }) {
  for (const page of [JOURNAL_TAMBAH, JOURNAL_UBAH]) {
    const src = read(page)
    expect(src, `${page} harus memuat master ${opts.masterLabel}`).toContain(`prisma.${opts.model}.findMany`)
    expect(src, `${page} harus meneruskan ${opts.prop} ke JournalForm`).toMatch(
      new RegExp(`<JournalForm[\\s\\S]{0,200}${opts.prop}=\\{${opts.prop}\\}`),
    )
  }
}
