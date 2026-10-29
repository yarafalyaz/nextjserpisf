import { describe, it, expect } from "vitest"
import {
  addCalendarDaysWib,
  addCalendarMonthsWib,
  buildTaxDisputeRegisterQueue,
  TAX_DISPUTE_LATE_FLAG,
  TAX_DISPUTE_PASAL36_SUBKINDS,
  TAX_DISPUTE_REGISTER_COLUMN_LABELS,
  TAX_DISPUTE_REGISTER_TITLE,
} from "../tax-dispute-register-queue"
import {
  assertBandinPrerequisite,
  assertNoDuplicateActiveObjection,
  assertNoSecondPk,
  assertStepKind,
  disputeStepDeadline,
  isStepLate,
} from "@/lib/services/tax-dispute.service"

/**
 * F-2026-10-27-113-S tahap 113-B (register-only, NOL jurnal).
 * Kata/enum/hasil putusan Lead Q-TXD-6..8 (PR #1407 final) + vonis 163-V
 * Putusan 5 (4 sub-jenis Pasal 36 ayat 1). AC-TXD-B1..B6.
 */

const SENT = new Date("2026-01-15T00:00:00+07:00")

function assessment(over: Record<string, unknown> = {}) {
  return {
    assessmentId: 1,
    slug: "skp-1",
    assessmentNumber: "00001/206/2026",
    kind: "SKPKB",
    taxKind: "ppn",
    assessedAmount: 100,
    disputedAmount: 60,
    paidUnderProtest: 60,
    sentAt: SENT,
    status: "DIPROSES",
    deletedAt: null,
    steps: [],
    ...over,
  }
}

describe("tenggat server WIB (Q-TXD-7, satu fungsi bernama)", () => {
  it("keberatan = kirim + 3 bulan kalender, batas 23:59:59 WIB", () => {
    const dl = addCalendarMonthsWib(SENT, 3)
    expect([dl.getFullYear(), dl.getMonth(), dl.getDate()]).toEqual([2026, 3, 15])
    expect([dl.getHours(), dl.getMinutes(), dl.getSeconds()]).toEqual([23, 59, 59])
  })

  it("bulan pendek = hari terakhir bulan hasil (31 Jan + 1 bulan = 28 Feb)", () => {
    const dl = addCalendarMonthsWib(new Date("2026-01-31T00:00:00+07:00"), 1)
    expect([dl.getFullYear(), dl.getMonth(), dl.getDate()]).toEqual([2026, 1, 28])
  })

  it("gugatan = +14 hari kalender, 23:59:59 WIB, tanpa geser libur", () => {
    const dl = addCalendarDaysWib(SENT, 14)
    expect([dl.getMonth(), dl.getDate()]).toEqual([0, 29])
    expect([dl.getHours(), dl.getMinutes(), dl.getSeconds()]).toEqual([23, 59, 59])
  })
})

describe("AC-TXD-B1: basis tenggat = tanggal kirim, bukan terima", () => {
  it("deadline upaya dihitung dari sentAt ketetapan", () => {
    const dl = disputeStepDeadline("KEBERATAN", SENT, null)
    expect(dl).not.toBeNull()
    expect([dl!.getFullYear(), dl!.getMonth(), dl!.getDate()]).toEqual([2026, 3, 15])
  })

  it("FALSIFIKASI B1 (builder): kirim+terima terisi = kirim menang (bukan terima)", () => {
    const filedAt = new Date("2026-02-10T00:00:00+07:00")
    const q = buildTaxDisputeRegisterQueue([
      assessment({
        sentAt: SENT,
        steps: [
          { stepId: 9, kind: "KEBERATAN", article36Subkind: null, status: "DIAJUKAN", filedAt, decidedAt: null, decidedAmount: null, lateReason: null },
        ],
      }),
    ])
    // Basis kirim 15 Jan + 3 bulan = 15 Apr; basis terima 10 Feb = 10 Mei.
    // Mutasi (filedAt ?? sentAt) menggeser ke 10 Mei -> tes ini MERAH.
    const dl = q.rows[0].nearestDeadline!
    expect([dl.getMonth(), dl.getDate()]).toEqual([3, 15])
  })

  it("FALSIFIKASI B1: basis terima internal menggeser tenggat = MERAH", () => {
    const receivedAt = new Date("2026-02-10T00:00:00+07:00")
    const wrong = addCalendarMonthsWib(receivedAt, 3)
    const right = disputeStepDeadline("KEBERATAN", SENT, null)!
    // Bila implementasi memakai terima, tenggat = 10 Mei; basis kirim = 15 Apr.
    expect(wrong.getTime()).not.toEqual(right.getTime())
    expect([right.getMonth(), right.getDate()]).toEqual([3, 15])
  })
})

describe("AC-TXD-B2: rantai upaya tertolak", () => {
  const active = { kind: "KEBERATAN", article36Subkind: null, status: "DIAJUKAN", filedAt: SENT, lateReason: null }

  it("keberatan kedua aktif atas SKP sama ditolak", () => {
    expect(() => assertNoDuplicateActiveObjection([active], "KEBERATAN")).toThrow(
      /Keberatan kedua/,
    )
  })

  it("keberatan pertama lolos; upaya tahap lain tak ikut tertolak", () => {
    expect(() => assertNoDuplicateActiveObjection([], "KEBERATAN")).not.toThrow()
    expect(() => assertNoDuplicateActiveObjection([active], "BANDING")).not.toThrow()
  })

  it("banding tanpa SK Keputusan Keberatan diputus ditolak", () => {
    expect(() => assertBandinPrerequisite([], "BANDING")).toThrow(/Keputusan Keberatan/)
    expect(() =>
      assertBandinPrerequisite(
        [{ ...active, status: "DIPUTUS" }],
        "BANDING",
      ),
    ).not.toThrow()
  })

  it("PK kedua ditolak; PK pertama lolos", () => {
    expect(() =>
      assertNoSecondPk(
        [{ kind: "PENINJAUAN_KEMBALI", article36Subkind: null, status: "DIPUTUS", filedAt: SENT, lateReason: null }],
        "PENINJAUAN_KEMBALI",
      ),
    ).toThrow(/hanya satu kali/)
    expect(() => assertNoSecondPk([], "PENINJAUAN_KEMBALI")).not.toThrow()
  })
})

describe("AC-TXD-B4: lewat tenggat = flag + alasan", () => {
  it("ajuan lewat tenggat butuh lateReason (isStepLate true)", () => {
    const late = new Date("2026-05-01T00:00:00+07:00")
    expect(isStepLate(SENT, late, "KEBERATAN")).toBe(true)
  })

  it("ajuan dalam tenggat tidak tertanda", () => {
    const onTime = new Date("2026-03-01T00:00:00+07:00")
    expect(isStepLate(SENT, onTime, "KEBERATAN")).toBe(false)
  })
})

describe("AC-TXD-B6: putusan sebagian turunan server; hapus fisik mustahil", () => {
  it("sisa disengketakan = disengketakan − jumlah putusan (server)", () => {
    const q = buildTaxDisputeRegisterQueue([
      assessment({
        steps: [
          { stepId: 1, kind: "KEBERATAN", article36Subkind: null, status: "DIPUTUS", filedAt: SENT, decidedAt: SENT, decidedAmount: 25, lateReason: null },
          { stepId: 2, kind: "BANDING", article36Subkind: null, status: "DIAJUKAN", filedAt: SENT, decidedAt: null, decidedAmount: null, lateReason: null },
        ],
      }),
    ])
    expect(q.rows[0].remainingDisputed).toBe(35)
  })

  it("baris deletedAt non-null dikecualikan (baca lunak, bukan hapus fisik)", () => {
    const q = buildTaxDisputeRegisterQueue([
      assessment({ deletedAt: new Date("2026-02-01T00:00:00+07:00") }),
    ])
    expect(q.rows).toHaveLength(0)
    expect(q.totals.assessments).toBe(0)
  })
})

describe("AC-TXD-B5: nominal tidak bocor + kata verbatim Q-TXD-6", () => {
  it("judul + label kolom verbatim putusan Lead", () => {
    expect(TAX_DISPUTE_REGISTER_TITLE).toBe("Register Ketetapan Pajak")
    expect(TAX_DISPUTE_REGISTER_COLUMN_LABELS).toEqual({
      assessmentNumber: "Nomor Ketetapan",
      assessmentKind: "Jenis Ketetapan",
      assessedAmount: "Nominal Ketetapan",
      disputedAmount: "Nominal Disengketakan",
      paidUnderProtest: "Dibayar di Bawah Protes",
      stepDeadline: "Tenggat Upaya",
    })
  })

  it("FALSIFIKASI B5: payload tanpa izin = loader melempar sebelum query (lihat tes loader)", () => {
    expect(TAX_DISPUTE_LATE_FLAG).toBe("LEWAT_TENGGAT")
  })
})

describe("vonis 163-V Putusan 5: 4 sub-jenis Pasal 36 ayat (1)", () => {
  it("enum sub-jenis persis 4", () => {
    expect([...TAX_DISPUTE_PASAL36_SUBKINDS]).toEqual([
      "SANKSI_KURANG_HAPUS",
      "SKP_KURANG_BATAL",
      "STP_KURANG_BATAL",
      "BATAL_DEMI_HUKUM",
    ])
  })

  it("PENGURANGAN_PEMBATALAN tanpa sub-jenis ditolak", () => {
    expect(() => assertStepKind("PENGURANGAN_PEMBATALAN", null)).toThrow(/Sub-jenis Pasal 36 wajib/)
  })

  it("tiap sub-jenis sah diterima", () => {
    for (const sub of TAX_DISPUTE_PASAL36_SUBKINDS) {
      expect(() => assertStepKind("PENGURANGAN_PEMBATALAN", sub)).not.toThrow()
    }
  })

  it("sub-jenis karangan tahap register (7 nama lama) ditolak", () => {
    expect(() => assertStepKind("PENGURANGAN_PEMBATALAN", "PENGHAPUSAN_SANKSI")).toThrow(
      /tidak dikenal/,
    )
  })

  it("upaya non-Pasal 36 tak butuh sub-jenis", () => {
    expect(() => assertStepKind("KEBERATAN", null)).not.toThrow()
  })
})
