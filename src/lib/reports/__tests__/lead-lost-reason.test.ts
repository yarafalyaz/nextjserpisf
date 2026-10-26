import { describe, it, expect } from "vitest"

/**
 * F-2026-10-25-030-S (putusan Lead Q-LR-1..4 26 Okt 2026 07:08 WIB).
 * - Q-LR-1: kamus lead sendiri 8 key; key quotation asing ditolak.
 * - Q-LR-2: kategori wajib transisi lost baru; lainnya+kosong sah.
 * - Q-LR-3: rincian lostCount per kategori + ember tak-tercatat.
 * - Q-LR-4: won/lost terminal mutlak.
 * - AC-LR-B4: teks bebas TIDAK pernah ditebak jadi kategori.
 * - AC-LR-B3: format -> parse putar-balik kategori yang sama.
 */
import {
  LEAD_LOST_REASON_CATEGORIES,
  LEAD_LOST_REASON_FREE_TEXT_MAX,
  buildLeadLostReasonBreakdown,
  formatLeadLostReason,
  isLeadLostReasonCategoryKey,
  latestLeadLostDescription,
  leadLostReasonPrefix,
  parseLeadLostReasonCategory,
  validateLeadLostTransition,
} from "../lead-lost-reason"

describe("F-2026-10-25-030-S kamus Q-LR-1", () => {
  it("8 key final terkunci urutan kanonik", () => {
    expect(LEAD_LOST_REASON_CATEGORIES.map((c) => c.key)).toEqual([
      "budget",
      "harga",
      "waktu",
      "tidak-ada-respons",
      "kalah-kompetitor",
      "bukan-target",
      "pembatalan",
      "lainnya",
    ])
  })

  it("key kamus quotation (F-101) BUKAN key lead", () => {
    for (const qKey of [
      "waktu-pengerjaan",
      "part-tak-tersedia",
      "pelanggan-menunda",
      "pilih-bengkel-lain",
      "spesifikasi-berubah",
    ]) {
      expect(isLeadLostReasonCategoryKey(qKey)).toBe(false)
    }
  })
})

describe("AC-LR-B2/B3 parse + format putar-balik", () => {
  it("setiap kategori: format -> parse kembali sama", () => {
    for (const c of LEAD_LOST_REASON_CATEGORIES) {
      expect(parseLeadLostReasonCategory(formatLeadLostReason({ category: c.key }))).toBe(c.key)
      expect(
        parseLeadLostReasonCategory(
          formatLeadLostReason({ category: c.key, freeText: "catatan bebas" }),
        ),
      ).toBe(c.key)
    }
  })

  it("awalan pertama menang; awalan kedua di teks bebas = isi bebas", () => {
    expect(
      parseLeadLostReasonCategory("[kalah:harga] lalu [kalah:budget]"),
    ).toBe("harga")
  })

  it("teks sebelum awalan -> tak-tercatat (BR-LR-06: hanya posisi 0 sah)", () => {
    expect(parseLeadLostReasonCategory("catatan bebas [kalah:harga]")).toBeNull()
    expect(parseLeadLostReasonCategory("harga mahal")).toBeNull()
  })

  it("awalan key asing -> null (tak-tercatat), bukan kategori karangan", () => {
    expect(parseLeadLostReasonCategory("[kalah:asing-xyz] catatan")).toBeNull()
    expect(parseLeadLostReasonCategory(null)).toBeNull()
    expect(parseLeadLostReasonCategory("")).toBeNull()
  })
})

describe("AC-LR-B4 rincian ember jujur", () => {
  it("teks bebas mengandung kata kategori TANPA awalan tetap tak-tercatat", () => {
    const rows = buildLeadLostReasonBreakdown([
      "harga mahal sekali, budget tidak masuk",
      null,
      "",
    ])
    expect(rows.find((r) => r.key === "harga")?.count).toBe(0)
    expect(rows.find((r) => r.key === "budget")?.count).toBe(0)
    expect(rows.find((r) => r.key === "tak-tercatat")?.count).toBe(3)
  })

  it("campuran sah + lama: jumlah count = jumlah lead lost; urutan kanonik stabil", () => {
    const rows = buildLeadLostReasonBreakdown([
      leadLostReasonPrefix("budget"),
      "[kalah:budget] dua kali",
      "[kalah:lainnya]",
      "alasan lama tanpa struktur",
    ])
    expect(rows.reduce((sum, r) => sum + r.count, 0)).toBe(4)
    expect(rows.find((r) => r.key === "budget")?.count).toBe(2)
    expect(rows.find((r) => r.key === "lainnya")?.count).toBe(1)
    expect(rows.at(-1)?.key).toBe("tak-tercatat")
    expect(rows.find((r) => r.key === "tak-tercatat")?.count).toBe(1)
    expect(rows.map((r) => r.key)).toEqual([
      "budget", "harga", "waktu", "tidak-ada-respons", "kalah-kompetitor",
      "bukan-target", "pembatalan", "lainnya", "tak-tercatat",
    ])
  })
})

describe("AC-LR-B1/B2/B5 validasi transisi (Q-LR-2/Q-LR-4)", () => {
  it("transisi ke lost tanpa kategori ditolak (AC-LR-B1)", () => {
    for (const from of ["new", "contacted", "qualified", "proposal", "negotiation"]) {
      const r = validateLeadLostTransition({ fromStatus: from, toStatus: "lost" })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error).toContain("wajib dipilih")
    }
  })

  it("key asing ditolak eksplisit (AC-LR-B2)", () => {
    const r = validateLeadLostTransition({
      fromStatus: "proposal", toStatus: "lost", category: "pilih-bengkel-lain",
    })
    expect(r).toEqual({ ok: false, error: "Kategori alasan kalah tidak dikenal" })
  })

  it("kategori sah -> description berawalan; lainnya + teks kosong sah (AC-LR-B3/Q-LR-2)", () => {
    expect(
      validateLeadLostTransition({ fromStatus: "new", toStatus: "lost", category: "lainnya" }),
    ).toEqual({ ok: true, description: "[kalah:lainnya]" })
    expect(
      validateLeadLostTransition({
        fromStatus: "negotiation", toStatus: "lost", category: "harga", freeText: "  kemahalan  ",
      }),
    ).toEqual({ ok: true, description: "[kalah:harga] kemahalan" })
  })

  it("teks bebas > 2000 char ditolak", () => {
    const r = validateLeadLostTransition({
      fromStatus: "new", toStatus: "lost", category: "budget",
      freeText: "x".repeat(LEAD_LOST_REASON_FREE_TEXT_MAX + 1),
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain("maksimal 2000")
  })

  it("won -> lost dan lost -> aktif/won ditolak terminal (AC-LR-B5)", () => {
    expect(
      validateLeadLostTransition({ fromStatus: "won", toStatus: "lost", category: "budget" }).ok,
    ).toBe(false)
    expect(validateLeadLostTransition({ fromStatus: "lost", toStatus: "new" }).ok).toBe(false)
    expect(validateLeadLostTransition({ fromStatus: "lost", toStatus: "won" }).ok).toBe(false)
    expect(validateLeadLostTransition({ fromStatus: "won", toStatus: "contacted" }).ok).toBe(false)
  })

  it("transisi non-lost / tanpa perubahan status tidak meminta alasan", () => {
    expect(validateLeadLostTransition({ fromStatus: "new", toStatus: "contacted" })).toEqual({
      ok: true, description: null,
    })
    expect(validateLeadLostTransition({ fromStatus: "lost", toStatus: "lost" })).toEqual({
      ok: true, description: null,
    })
    expect(validateLeadLostTransition({ fromStatus: "won", toStatus: null })).toEqual({
      ok: true, description: null,
    })
  })
})

describe("latestLeadLostDescription", () => {
  it("mengambil status_change->lost terakhir, abaikan aktivitas lain", () => {
    const desc = latestLeadLostDescription([
      { type: "note", newStatus: null, description: "[kalah:harga]" },
      { type: "status_change", newStatus: "contacted", description: "[kalah:harga]" },
      { type: "status_change", newStatus: "lost", description: "[kalah:budget]" },
    ])
    expect(desc).toBe("[kalah:budget]")
    expect(
      latestLeadLostDescription([
        { type: "status_change", newStatus: "contacted", description: null },
      ]),
    ).toBeNull()
  })
})
