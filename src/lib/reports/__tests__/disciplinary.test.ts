import { describe, expect, it } from "vitest"

import {
  deriveDisciplinaryStatus,
  deriveNextDisciplinaryLevel,
  disciplinaryExpiryDate,
  evaluateDisciplinaryApprovalSod,
  evaluateDisciplinaryEmployeeResponse,
  evaluateDisciplinaryRejection,
  evaluateDisciplinaryResponseWindow,
  evaluateFirstFinalDisciplinary,
  evaluateRequestedDisciplinaryLevel,
  DISCIPLINARY_GENERAL_CATEGORIES,
  DISCIPLINARY_SEVERE_CATEGORIES,
  isDisciplinarySevereCategory,
  isDisciplinaryViolationCategory,
  isDisciplinaryActiveAt,
  summarizeDisciplinaryAttention,
  type DisciplinaryRecordLike,
} from "@/lib/reports/disciplinary"

const d = (s: string) => new Date(`${s}T00:00:00.000Z`)

let seq = 0
function rec(partial: Partial<DisciplinaryRecordLike>): DisciplinaryRecordLike {
  seq += 1
  return {
    id: seq,
    employeeId: 10,
    level: "sp1",
    workflowStatus: "issued",
    violationDate: d("2026-01-05"),
    issuedAt: d("2026-01-05"),
    voidedAt: null,
    ...partial,
  }
}

describe("masa berlaku turunan (BR-DISC-02/03)", () => {
  it("terbit 5 Jan -> kedaluwarsa turunan 5 Jul; aktif pada tanggal kedaluwarsa, expired sesudahnya", () => {
    const r = rec({})
    expect(disciplinaryExpiryDate(r.issuedAt as Date)).toEqual(d("2026-07-05"))
    expect(deriveDisciplinaryStatus(r, d("2026-07-05"))).toBe("active")
    expect(deriveDisciplinaryStatus(r, d("2026-07-06"))).toBe("expired")
  })

  it("edge akhir bulan: 31 Agu 2025 + 6 bulan kalender = 28 Feb 2026 (bukan +180 hari)", () => {
    expect(disciplinaryExpiryDate(d("2025-08-31"))).toEqual(d("2026-02-28"))
  })

  it("rekod belum issued tidak pernah active/expired turunan", () => {
    const r = rec({ workflowStatus: "pending_approval", issuedAt: null })
    expect(deriveDisciplinaryStatus(r, d("2026-01-06"))).toBe("pending_approval")
    expect(isDisciplinaryActiveAt(r, d("2026-01-06"))).toBe(false)
  })

  it("kejadian sebelum tanggal terbit tidak dihitung aktif (edge violationDate lama)", () => {
    const r = rec({ issuedAt: d("2026-03-01") })
    expect(isDisciplinaryActiveAt(r, d("2026-02-01"))).toBe(false)
  })
})

describe("deriveNextDisciplinaryLevel (BR-DISC-01/04)", () => {
  it("AC-DISC-1: tanpa SP aktif -> sp1; pelanggaran 2 bulan kemudian -> sp2", () => {
    expect(deriveNextDisciplinaryLevel([], 10, d("2026-01-05"))).toEqual({
      kind: "level",
      level: "sp1",
    })
    const sp1 = rec({})
    expect(deriveNextDisciplinaryLevel([sp1], 10, d("2026-03-05"))).toEqual({
      kind: "level",
      level: "sp2",
    })
  })

  it("AC-DISC-2: SP1 terbit > 6 bulan lalu -> pelanggaran baru kembali sp1, riwayat tetap expired terbaca", () => {
    const old = rec({})
    expect(deriveDisciplinaryStatus(old, d("2026-08-01"))).toBe("expired")
    expect(deriveNextDisciplinaryLevel([old], 10, d("2026-08-01"))).toEqual({
      kind: "level",
      level: "sp1",
    })
  })

  it("AC-DISC-3: SP3 aktif + pelanggaran baru -> kajian berhenti, BUKAN sp4", () => {
    const sp3 = rec({ level: "sp3" })
    expect(deriveNextDisciplinaryLevel([sp3], 10, d("2026-03-01"))).toEqual({
      kind: "review_termination",
      activeLevel: "sp3",
    })
  })

  it("SP pertama-dan-terakhir aktif + pelanggaran baru -> kajian berhenti", () => {
    const ff = rec({ level: "sp_first_final" })
    expect(deriveNextDisciplinaryLevel([ff], 10, d("2026-03-01"))).toEqual({
      kind: "review_termination",
      activeLevel: "sp_first_final",
    })
  })

  it("teguran lisan (verbal) tercatat TIDAK menaikkan jenjang", () => {
    const verbal = rec({ level: "verbal" })
    expect(deriveNextDisciplinaryLevel([verbal], 10, d("2026-03-01"))).toEqual({
      kind: "level",
      level: "sp1",
    })
  })

  it("AC-DISC-10: rekod dibatalkan (voidedAt) dikeluarkan dari rantai", () => {
    const sp1 = rec({})
    const sp2Voided = rec({
      level: "sp2",
      issuedAt: d("2026-03-05"),
      violationDate: d("2026-03-05"),
      voidedAt: d("2026-03-20"),
    })
    expect(deriveNextDisciplinaryLevel([sp1, sp2Voided], 10, d("2026-04-01"))).toEqual({
      kind: "level",
      level: "sp2",
    })
  })

  it("rekod karyawan lain dan rekod rejected tidak memengaruhi rantai", () => {
    const other = rec({ employeeId: 99, level: "sp2" })
    const rejected = rec({ workflowStatus: "rejected", issuedAt: null })
    expect(deriveNextDisciplinaryLevel([other, rejected], 10, d("2026-03-01"))).toEqual({
      kind: "level",
      level: "sp1",
    })
  })

  it("jenjang dihitung per violationDate, bukan tanggal pengajuan (rantai pada tanggal kejadian)", () => {
    const sp1 = rec({})
    const sp2 = rec({ level: "sp2", issuedAt: d("2026-03-05"), violationDate: d("2026-03-05") })
    // Kejadian 2026-02-01: hanya sp1 yang sudah terbit & aktif saat itu.
    expect(deriveNextDisciplinaryLevel([sp1, sp2], 10, d("2026-02-01"))).toEqual({
      kind: "level",
      level: "sp2",
    })
  })
})

describe("evaluateRequestedDisciplinaryLevel (BR-DISC-04)", () => {
  it("AC-DISC-1: pengaju memilih sp3 manual saat turunan sp2 DITOLAK", () => {
    const sp1 = rec({})
    const r = evaluateRequestedDisciplinaryLevel({
      records: [sp1],
      employeeId: 10,
      violationDate: d("2026-03-05"),
      requestedLevel: "sp3",
    })
    expect(r.allowed).toBe(false)
  })

  it("pilihan sama dengan turunan lolos; jenjang tidak sah ditolak", () => {
    expect(
      evaluateRequestedDisciplinaryLevel({
        records: [],
        employeeId: 10,
        violationDate: d("2026-01-05"),
        requestedLevel: "sp1",
      }),
    ).toEqual({ allowed: true })
    expect(
      evaluateRequestedDisciplinaryLevel({
        records: [],
        employeeId: 10,
        violationDate: d("2026-01-05"),
        requestedLevel: "sp4",
      }).allowed,
    ).toBe(false)
  })

  it("AC-DISC-3: SP3 aktif -> permintaan SP baru apa pun ditolak sebagai kajian berhenti", () => {
    const sp3 = rec({ level: "sp3" })
    const r = evaluateRequestedDisciplinaryLevel({
      records: [sp3],
      employeeId: 10,
      violationDate: d("2026-03-01"),
      requestedLevel: "sp1",
    })
    expect(r.allowed).toBe(false)
    if (!r.allowed) expect(r.message).toContain("kajian berhenti")
  })
})

describe("evaluateFirstFinalDisciplinary (BR-DISC-05)", () => {
  it("AC-DISC-9: daftar berat kosong -> kategori apa pun DITOLAK", () => {
    expect(
      evaluateFirstFinalDisciplinary({ violationCategory: "pencurian", severeCategories: [] })
        .allowed,
    ).toBe(false)
  })

  it("kategori terdaftar lolos; di luar daftar ditolak", () => {
    const severe = ["pencurian", "penggelapan"]
    expect(
      evaluateFirstFinalDisciplinary({ violationCategory: "pencurian", severeCategories: severe }),
    ).toEqual({ allowed: true })
    expect(
      evaluateFirstFinalDisciplinary({ violationCategory: "terlambat", severeCategories: severe })
        .allowed,
    ).toBe(false)
  })
})

describe("evaluateDisciplinaryApprovalSod (BR-DISC-06)", () => {
  it("AC-DISC-4: self-approve pengajuan sendiri DITOLAK", () => {
    expect(
      evaluateDisciplinaryApprovalSod({
        level: "sp1",
        requestedByEmployeeId: 7,
        approverEmployeeId: 7,
        secondApproverEmployeeId: null,
      }).allowed,
    ).toBe(false)
  })

  it("SP1/SP2 cukup satu penyetuju berbeda orang", () => {
    expect(
      evaluateDisciplinaryApprovalSod({
        level: "sp2",
        requestedByEmployeeId: 7,
        approverEmployeeId: 8,
        secondApproverEmployeeId: null,
      }),
    ).toEqual({ allowed: true })
  })

  it("AC-DISC-4: SP3 tanpa penyetuju kedua DITOLAK; penyetuju kedua = pengaju DITOLAK; tiga orang berbeda lolos", () => {
    expect(
      evaluateDisciplinaryApprovalSod({
        level: "sp3",
        requestedByEmployeeId: 7,
        approverEmployeeId: 8,
        secondApproverEmployeeId: null,
      }).allowed,
    ).toBe(false)
    expect(
      evaluateDisciplinaryApprovalSod({
        level: "sp3",
        requestedByEmployeeId: 7,
        approverEmployeeId: 8,
        secondApproverEmployeeId: 7,
      }).allowed,
    ).toBe(false)
    expect(
      evaluateDisciplinaryApprovalSod({
        level: "sp3",
        requestedByEmployeeId: 7,
        approverEmployeeId: 8,
        secondApproverEmployeeId: 9,
      }),
    ).toEqual({ allowed: true })
  })
})

describe("penolakan & tanggapan (AC-DISC-6/7, BR-DISC-12)", () => {
  it("AC-DISC-7: tolak tanpa alasan DITOLAK server", () => {
    expect(evaluateDisciplinaryRejection({ reason: null }).allowed).toBe(false)
    expect(evaluateDisciplinaryRejection({ reason: "  " }).allowed).toBe(false)
    expect(evaluateDisciplinaryRejection({ reason: "Bukti tidak cukup" })).toEqual({
      allowed: true,
    })
  })

  it("AC-DISC-6: tanggapan untuk rekod karyawan lain DITOLAK; rekod sendiri issued lolos", () => {
    expect(
      evaluateDisciplinaryEmployeeResponse({
        recordEmployeeId: 10,
        recordWorkflowStatus: "issued",
        responderEmployeeId: 11,
        response: "Saya menerima dan akan memperbaiki",
      }).allowed,
    ).toBe(false)
    expect(
      evaluateDisciplinaryEmployeeResponse({
        recordEmployeeId: 10,
        recordWorkflowStatus: "issued",
        responderEmployeeId: 10,
        response: "Saya menerima dan akan memperbaiki",
      }),
    ).toEqual({ allowed: true })
    expect(
      evaluateDisciplinaryEmployeeResponse({
        recordEmployeeId: 10,
        recordWorkflowStatus: "pending_approval",
        responderEmployeeId: 10,
        response: "Terlalu dini",
      }).allowed,
    ).toBe(false)
  })
})

describe("summarizeDisciplinaryAttention (§1.7)", () => {
  it("aktif, kedaluwarsa <=30 hari, dan risiko tertinggi SP3 terpisah benar", () => {
    const fresh = rec({ issuedAt: d("2026-01-05"), violationDate: d("2026-01-05") })
    const expiring = rec({ issuedAt: d("2025-07-20"), violationDate: d("2025-07-20") })
    const sp3 = rec({ level: "sp3", issuedAt: d("2026-01-01"), violationDate: d("2026-01-01") })
    const expired = rec({ issuedAt: d("2025-01-01"), violationDate: d("2025-01-01") })
    const s = summarizeDisciplinaryAttention([fresh, expiring, sp3, expired], d("2026-01-10"))
    expect(s.active.map((r) => r.id)).toEqual([fresh.id, expiring.id, sp3.id])
    expect(s.expiringWithin30Days.map((r) => r.id)).toEqual([expiring.id])
    expect(s.highestRisk.map((r) => r.id)).toEqual([sp3.id])
  })
})

describe("kategori resmi Q-DISC-1 & jendela tanggapan Q-DISC-3 (DISC-B1)", () => {
  it("daftar berat 7 + umum 6 verbatim putusan Lead; kategori bebas ditolak penjaga", () => {
    expect(DISCIPLINARY_SEVERE_CATEGORIES).toHaveLength(7)
    expect(DISCIPLINARY_GENERAL_CATEGORIES).toHaveLength(6)
    expect(DISCIPLINARY_SEVERE_CATEGORIES).toContain("pelecehan seksual")
    expect(DISCIPLINARY_GENERAL_CATEGORIES).toContain("mangkir tanpa keterangan berulang")
    expect(isDisciplinaryViolationCategory("lain-lain")).toBe(false)
    expect(isDisciplinaryViolationCategory(null)).toBe(false)
    expect(isDisciplinarySevereCategory("pelecehan seksual")).toBe(true)
    expect(isDisciplinarySevereCategory("mangkir tanpa keterangan berulang")).toBe(false)
  })

  it("jendela 7 hari kalender: hari ke-7 lolos, hari ke-8 DITOLAK", () => {
    const issuedAt = d("2026-01-05")
    expect(evaluateDisciplinaryResponseWindow({ issuedAt, at: d("2026-01-12") })).toEqual({
      allowed: true,
    })
    expect(evaluateDisciplinaryResponseWindow({ issuedAt, at: d("2026-01-13") }).allowed).toBe(false)
    expect(evaluateDisciplinaryResponseWindow({ issuedAt: null, at: d("2026-01-06") }).allowed).toBe(
      false,
    )
  })
})
