import { describe, it, expect } from "vitest"
import {
  readSrc as read,
  JOURNAL_ACTIONS,
  expectActionWritesField,
  expectPagesLoadMaster,
} from "./journal-wiring-helpers"

/**
 * Penjaga sambungan Pusat Laba ke jurnal.
 *
 * Mengapa perlu: jalur tulis `JournalEntry.profitCenterId` bergantung pada entri
 * yang dikirim form sebagai JSON. Aksi server tidak bisa melihat cacat di sisi itu —
 * kalau form berhenti menyertakan `profitCenterId`, aksinya tetap hijau (menulis
 * `null`) dan laporan pusat laba kembali kosong tanpa satu pun tes memerah.
 * Pola yang sama sudah terbukti pada checkbox hari kerja (`workDays`).
 */

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
    expectPagesLoadMaster(read, { model: "profitCenter", prop: "profitCenters", masterLabel: "pusat laba" })
  })

  it("aksi jurnal menulis profitCenterId di kedua jalur (buat dan ubah)", () => {
    expectActionWritesField(read(JOURNAL_ACTIONS), "profitCenterId", "Pusat Laba")
  })
})
