import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * Penjaga sambungan Pusat Biaya → jurnal manual.
 *
 * Mengapa perlu: aksi jurnal SUDAH menulis `costCenterId` di KEDUA jalur (buat dan
 * ubah) sejak lama, dan laporan pusat biaya membacanya — tetapi form jurnal manual
 * tidak pernah punya select maupun mengirim nilainya. Jadi seluruh jurnal manual
 * tidak bisa ditandai pusat biaya, dan laporannya melewatkannya. Cacat ini tidak
 * terlihat dari tes aksi (aksinya benar) maupun dari tsc (tipenya opsional):
 * satu-satunya tempat yang bisa menangkapnya adalah sisi FORMULIR dan HALAMAN.
 *
 * Pusat laba punya cacat identik dan sudah ditutup lebih dulu — penjaga ini
 * memastikan yang satunya tidak tertinggal lagi, dan berarah dua: pilihan yang
 * dihapus dari form memerahkan tes ini.
 */

const ROOT = join(__dirname, "..", "..")
const read = (p: string) => readFileSync(join(ROOT, p), "utf8")

const FORM = "src/components/forms/journal-form.tsx"
const TAMBAH = "src/app/(dashboard)/keuangan/jurnal/tambah/page.tsx"
const UBAH = "src/app/(dashboard)/keuangan/jurnal/[slug]/ubah/page.tsx"
const ACTIONS = "src/actions/finance.actions.ts"

describe("pusat biaya: form jurnal mengirim, aksi menulis, halaman menyediakan", () => {
  it("form punya select pusat biaya dan mengirim costCenterId", () => {
    const form = read(FORM)
    expect(form).toContain('htmlFor="costCenterId"')
    expect(form).toContain('-- Tanpa pusat biaya --')
    // Nilai harus ikut terkirim di payload entri, bukan hanya dirender.
    expect(form).toContain("costCenterId: costCenterId ? Number(costCenterId) : undefined")
  })

  it("form mengisi ulang pilihan saat mengubah jurnal yang sudah bertanda", () => {
    // Tanpa prefill ini, membuka jurnal yang punya pusat biaya lalu menyimpan akan
    // MENGHAPUSNYA (select kembali ke kosong) — kehilangan data yang senyap.
    const form = read(FORM)
    expect(form).toMatch(/find\(\(entry\) => entry\.costCenterId\)\?\.costCenterId/)
    expect(form).toContain("journal?.entries?.find((entry) => entry.costCenterId)")
  })

  it("halaman ubah meneruskan costCenterId tiap entri ke form", () => {
    // Form hanya bisa prefill kalau halamannya benar-benar mengirim field ini.
    expect(read(UBAH)).toContain("costCenterId: e.costCenterId ?? undefined")
  })

  it("kedua halaman memuat master pusat biaya dan meneruskannya", () => {
    for (const page of [TAMBAH, UBAH]) {
      const src = read(page)
      expect(src).toContain("prisma.costCenter.findMany")
      expect(src).toContain("costCenters={costCenters}")
    }
  })

  it("aksi menulis costCenterId di KEDUA jalur (buat dan ubah)", () => {
    // Satu jalur saja berarti mengubah jurnal menghapus pusat biayanya.
    const writes = read(ACTIONS).match(/costCenterId: entry\.costCenterId \|\| null/g) ?? []
    expect(writes.length).toBeGreaterThanOrEqual(2)
  })
})
