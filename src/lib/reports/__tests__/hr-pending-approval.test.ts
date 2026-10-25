import { describe, expect, it } from "vitest"

import {
  buildHrPendingApprovalQueue,
  deriveHrPendingStage,
  HR_PENDING_LEAVE_NEAR_START_DAYS,
  HR_PENDING_STALE_DAYS,
  type HrPendingApprovalInput,
} from "@/lib/reports/hr-pending-approval"

const d = (s: string) => new Date(`${s}T00:00:00.000Z`)
// Hari acuan WIB: 2026-10-25 12:00 WIB = 05:00 UTC.
const TODAY = new Date("2026-10-25T05:00:00.000Z")

let seq = 0
function row(partial: Partial<HrPendingApprovalInput>): HrPendingApprovalInput {
  seq += 1
  return {
    id: seq,
    kind: "leave",
    employeeId: 10,
    employeeName: "Budi",
    departmentName: "Bengkel",
    slug: null,
    status: "pending",
    createdAt: d("2026-10-24"),
    eventDate: d("2026-11-10"),
    endDate: d("2026-11-12"),
    leaveType: "annual",
    hours: null,
    reason: "urusan keluarga",
    projectName: null,
    loanTotalAmount: null,
    loanMonthlyInstallment: null,
    loanWeeklyInstallment: null,
    ...partial,
  }
}

describe("saringan status persis pending (BR-HP-01/02, AC-HP-B1/B3)", () => {
  it("pending lolos; approved/rejected/cancelled dibuang (lembur approved rantai bukan pending)", () => {
    const rows = buildHrPendingApprovalQueue(
      [
        row({ id: 1, status: "pending" }),
        row({ id: 2, status: "approved" }),
        row({ id: 3, status: "rejected" }),
        row({ id: 4, kind: "overtime", status: "approved", leaveType: null, endDate: null, hours: "2.5" }),
        row({ id: 5, kind: "overtime", status: "pending", leaveType: null, endDate: null, hours: "2.5" }),
      ],
      TODAY,
    )
    expect(rows.map((r) => r.id)).toEqual([1, 5])
  })
})

describe("umur dari createdAt hari kalender WIB (BR-HP-04, AC-HP-B4)", () => {
  it("umur dihitung dari createdAt; baris tanpa updatedAt tetap berumur benar", () => {
    const [r] = buildHrPendingApprovalQueue([row({ createdAt: d("2026-10-20") })], TODAY)
    expect(r.umurMenungguHari).toBe(5)
    expect(r.tahapDasar).toBe("MENGENDAP")
  })

  it("batas ambang: tepat 3 hari masih MENUNGGU_KEPUTUSAN, 4 hari MENGENDAP", () => {
    expect(HR_PENDING_STALE_DAYS).toBe(3)
    const at = (created: string) =>
      deriveHrPendingStage({ kind: "leave", createdAt: d(created), eventDate: d("2026-12-01") }, TODAY)
    expect(at("2026-10-22").tahapDasar).toBe("MENUNGGU_KEPUTUSAN")
    expect(at("2026-10-21").tahapDasar).toBe("MENGENDAP")
  })

  it("EC-7: createdAt 23:30 UTC = 06:30 WIB hari berikut -> umur hari kalender WIB, bukan 24 jam UTC", () => {
    // 2026-10-24T23:30Z = 2026-10-25 06:30 WIB -> hari WIB sama dgn acuan.
    const s = deriveHrPendingStage(
      { kind: "leave", createdAt: new Date("2026-10-24T23:30:00.000Z"), eventDate: d("2026-12-01") },
      TODAY,
    )
    expect(s.umurMenungguHari).toBe(0)
  })

  it("createdAt sesudah hari acuan (jam mundur) umur terjepit 0, tidak negatif", () => {
    const s = deriveHrPendingStage(
      { kind: "leave", createdAt: d("2026-10-26"), eventDate: d("2026-12-01") },
      TODAY,
    )
    expect(s.umurMenungguHari).toBe(0)
  })
})

describe("penanda tanggal (BR-HP-05, AC-HP-B5, EC-1/2)", () => {
  it("cuti mulai besok -> MENDEKATI_MULAI sisa 1; mulai tepat ambang (3) ikut; 4 hari tidak", () => {
    expect(HR_PENDING_LEAVE_NEAR_START_DAYS).toBe(3)
    const at = (start: string) =>
      deriveHrPendingStage({ kind: "leave", createdAt: d("2026-10-24"), eventDate: d(start) }, TODAY)
    expect(at("2026-10-26")).toMatchObject({ penandaTanggal: "MENDEKATI_MULAI", sisaHariKeTanggal: 1 })
    expect(at("2026-10-28").penandaTanggal).toBe("MENDEKATI_MULAI")
    expect(at("2026-10-29").penandaTanggal).toBeNull()
  })

  it("EC-1: cuti mulai sudah lewat tanpa keputusan tetap berpenanda tanggal, sisa negatif", () => {
    const s = deriveHrPendingStage(
      { kind: "leave", createdAt: d("2026-10-01"), eventDate: d("2026-10-20") },
      TODAY,
    )
    expect(s).toMatchObject({ penandaTanggal: "MENDEKATI_MULAI", sisaHariKeTanggal: -5 })
  })

  it("lembur kemarin -> TANGGAL_LEWAT_BELUM_DIPUTUS; lembur hari ini (EC-2) tanpa penanda", () => {
    const ot = (date: string) =>
      deriveHrPendingStage({ kind: "overtime", createdAt: d("2026-10-24"), eventDate: d(date) }, TODAY)
    expect(ot("2026-10-24")).toMatchObject({
      penandaTanggal: "TANGGAL_LEWAT_BELUM_DIPUTUS",
      sisaHariKeTanggal: -1,
    })
    expect(ot("2026-10-25").penandaTanggal).toBeNull()
  })

  it("pendamping bisa bersamaan MENGENDAP (dua tahap tampil bersama)", () => {
    const [r] = buildHrPendingApprovalQueue(
      [row({ createdAt: d("2026-10-01"), eventDate: d("2026-10-26") })],
      TODAY,
    )
    expect(r.tahapDasar).toBe("MENGENDAP")
    expect(r.penandaTanggal).toBe("MENDEKATI_MULAI")
    expect(r.tahapDasarLabel).toBe("Mengendap")
    expect(r.penandaTanggalLabel).toBe("Mendekati Tanggal Mulai")
  })
})

describe("urutan tampil BR-HP-05", () => {
  it("penanda tanggal paling parah dulu, lalu MENGENDAP umur terbesar, lalu MENUNGGU umur terbesar; seri createdAt lalu id", () => {
    const rows = buildHrPendingApprovalQueue(
      [
        // MENUNGGU umur 1 tanpa penanda
        row({ id: 10, createdAt: d("2026-10-24"), eventDate: d("2026-12-01") }),
        // MENGENDAP umur 10 tanpa penanda
        row({ id: 11, createdAt: d("2026-10-15"), eventDate: d("2026-12-01") }),
        // penanda sisa -2 (paling parah)
        row({ id: 12, kind: "overtime", leaveType: null, endDate: null, hours: "1", createdAt: d("2026-10-24"), eventDate: d("2026-10-23") }),
        // penanda sisa 1
        row({ id: 13, createdAt: d("2026-10-24"), eventDate: d("2026-10-26") }),
        // MENGENDAP umur 5 tanpa penanda
        row({ id: 14, createdAt: d("2026-10-20"), eventDate: d("2026-12-01") }),
      ],
      TODAY,
    )
    expect(rows.map((r) => r.id)).toEqual([12, 13, 11, 14, 10])
  })

  it("EC-4: dua pengajuan karyawan sama beda jenis tampil dua baris terpisah", () => {
    const rows = buildHrPendingApprovalQueue(
      [
        row({ id: 20, employeeId: 7 }),
        row({ id: 21, employeeId: 7, kind: "overtime", leaveType: null, endDate: null, hours: "3" }),
      ],
      TODAY,
    )
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.kind).sort()).toEqual(["leave", "overtime"])
  })
})

describe("bentuk baris jujur (BR-HP-07/08/12)", () => {
  it("baris tidak membawa calculatedValue/nominal apa pun; field verbatim diteruskan", () => {
    const [r] = buildHrPendingApprovalQueue(
      [row({ id: 30, departmentName: null, leaveType: "sick", reason: "opname" })],
      TODAY,
    )
    expect(r).not.toHaveProperty("calculatedValue")
    expect(JSON.stringify(r)).not.toContain("calculatedValue")
    expect(r.departmentName).toBeNull()
    expect(r.leaveType).toBe("sick")
    expect(r.reason).toBe("opname")
    expect(r.endDate).toEqual(d("2026-11-12"))
  })
})

describe("kind loan (F-2026-10-25-018-S BR-LS-06, Q-LS-3a, AC-LS-B5)", () => {
  const loanRow = (partial: Partial<HrPendingApprovalInput>) =>
    row({
      kind: "loan",
      leaveType: null,
      endDate: null,
      hours: null,
      reason: null,
      projectName: null,
      loanTotalAmount: "5000000.00",
      loanMonthlyInstallment: "500000.00",
      loanWeeklyInstallment: null,
      ...partial,
    })

  it("pending lolos; active/rejected/paid_off dibuang (hanya PERSIS pending)", () => {
    const rows = buildHrPendingApprovalQueue(
      [
        loanRow({ id: 41, status: "pending" }),
        loanRow({ id: 42, status: "active" }),
        loanRow({ id: 43, status: "rejected" }),
        loanRow({ id: 44, status: "paid_off" }),
      ],
      TODAY,
    )
    expect(rows.map((r) => r.id)).toEqual([41])
  })

  it("tanpa pendamping tanggal walau loanDate lewat; umur menunggu dari createdAt tetap jalan", () => {
    const [r] = buildHrPendingApprovalQueue(
      [loanRow({ id: 45, createdAt: d("2026-10-20"), eventDate: d("2026-10-20") })],
      TODAY,
    )
    expect(r.penandaTanggal).toBeNull()
    expect(r.umurMenungguHari).toBe(5)
    expect(r.tahapDasar).toBe("MENGENDAP")
  })

  it("nominal pinjaman verbatim; cicilan cuti/lembur tetap null; baris loan tanpa field gaji", () => {
    const rows = buildHrPendingApprovalQueue(
      [
        loanRow({ id: 46, loanWeeklyInstallment: "125000.00" }),
        row({ id: 47 }),
      ],
      TODAY,
    )
    const loan = rows.find((r) => r.kind === "loan")!
    expect(loan.loanTotalAmount).toBe("5000000.00")
    expect(loan.loanMonthlyInstallment).toBe("500000.00")
    expect(loan.loanWeeklyInstallment).toBe("125000.00")
    expect(loan).not.toHaveProperty("salary")
    expect(JSON.stringify(loan)).not.toContain("salary")
    const leave = rows.find((r) => r.kind === "leave")!
    expect(leave.loanTotalAmount).toBeNull()
    expect(leave.loanMonthlyInstallment).toBeNull()
    expect(leave.loanWeeklyInstallment).toBeNull()
  })
})
