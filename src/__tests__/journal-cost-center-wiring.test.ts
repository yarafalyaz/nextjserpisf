import { describe, it, expect } from "vitest"
import {
  readSrc as read,
  JOURNAL_FORM as FORM,
  JOURNAL_UBAH as UBAH,
  JOURNAL_ACTIONS as ACTIONS,
  JOURNAL_TAMBAH as TAMBAH,
  expectActionWritesField,
} from "./journal-wiring-helpers"

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

describe("pusat biaya: form jurnal mengirim, aksi menulis, halaman menyediakan", () => {
  it("form punya select pusat biaya dan mengirim costCenterId", () => {
    const form = read(FORM)
    expect(form).toContain('htmlFor="costCenterId"')
    expect(form).toContain('-- Tanpa pusat biaya --')
    // Nilai harus ikut terkirim di payload entri, bukan hanya dirender.
    expect(form).toContain("costCenterId: costCenterId ? Number(costCenterId) : undefined")
  })

  it("form mengisi ulang pilihan saat mengubah jurnal yang sudah bertanda", () => {
    const form = read(FORM)
    expect(form).toMatch(/find\(\(entry\) => entry\.costCenterId\)\?\.costCenterId/)
    expect(form).toContain("journal?.entries?.find((entry) => entry.costCenterId)")
  })

  it("halaman ubah meneruskan costCenterId tiap entri ke form", () => {
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
    expectActionWritesField(read(ACTIONS), "costCenterId", "Pusat Biaya")
  })
})
