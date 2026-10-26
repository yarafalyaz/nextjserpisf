import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * SLA tiket CRM F-2026-10-24-135-S lapis aman (baca-saja), konstanta
 * tersahkan PUTUSAN Lead PR #901 (Q-SLA135-1/2). Yang dijaga AC-BE §6:
 * tabel target persis; jam kerja Sen–Jum 08:00–17:00 WIB potong
 * Holiday (Sabtu BUKAN hari kerja); tenggat melintasi akhir pekan +
 * libur + batas hari sama; open lewat-respons vs in_progress
 * lewat-resolusi terbedakan; prioritas liar/kosong/null = medium +
 * flag; deletedAt dikecualikan; resolved historis tidak di antrean
 * aktif; loader view_tickets fail-closed + nol mutasi.
 * Falsifikasi: geser satu angka konstanta -> tes tabel MERAH.
 */

const mocks = vi.hoisted(() => ({
  crmTicketFindMany: vi.fn(),
  crmTicketUpdate: vi.fn(),
  crmTicketCreate: vi.fn(),
  holidayFindMany: vi.fn(),
  userFindMany: vi.fn(),
  requirePermission: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    crmTicket: {
      findMany: (...a: unknown[]) => mocks.crmTicketFindMany(...a),
      update: (...a: unknown[]) => mocks.crmTicketUpdate(...a),
      create: (...a: unknown[]) => mocks.crmTicketCreate(...a),
    },
    holiday: {
      findMany: (...a: unknown[]) => mocks.holidayFindMany(...a),
    },
    user: {
      findMany: (...a: unknown[]) => mocks.userFindMany(...a),
    },
  },
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermission(...a),
}))

import {
  addWorkingMinutes,
  buildCrmTicketSla,
  workingMinutesBetween,
  workingMinutesOnWibDate,
  CRM_TICKET_SLA_TARGETS_MINUTES,
  type CrmTicketSlaInput,
} from "../crm-ticket-sla"
import { getCrmTicketSla } from "../crm-ticket-sla-data"

/** Instant dari dinding-jam WIB. */
function wib(y: number, m: number, d: number, h = 0, mi = 0): Date {
  return new Date(Date.UTC(y, m - 1, d, h - 7, mi))
}

const NO_HOLIDAYS: Date[] = []

function input(over: Partial<CrmTicketSlaInput>): CrmTicketSlaInput {
  return {
    id: 1,
    slug: "tiket-1",
    ticketNumber: "TK-0001",
    subject: "Mesin mati",
    priority: "medium",
    status: "open",
    customerName: "PT Uji",
    assignedTo: null,
    assignedToName: null,
    createdAt: wib(2026, 10, 26, 8),
    firstResponseAt: null,
    resolvedAt: null,
    deletedAt: null,
    ...over,
  }
}

describe("konstanta tersahkan Q-SLA135-1/2", () => {
  it("tabel target menit jam kerja persis putusan", () => {
    expect(CRM_TICKET_SLA_TARGETS_MINUTES).toEqual({
      HIGH: { response: 120, resolution: 540 },
      MEDIUM: { response: 240, resolution: 1620 },
      LOW: { response: 480, resolution: 2700 },
    })
  })
})

describe("jam kerja murni", () => {
  it("hari sama dalam jam kerja dihitung menit persis", () => {
    expect(workingMinutesBetween(wib(2026, 10, 26, 8), wib(2026, 10, 26, 12), NO_HOLIDAYS)).toBe(240)
    expect(workingMinutesBetween(wib(2026, 10, 26, 7), wib(2026, 10, 26, 18), NO_HOLIDAYS)).toBe(540)
    expect(workingMinutesOnWibDate(wib(2026, 10, 26, 12), NO_HOLIDAYS)).toBe(540)
  })

  it("akhir pekan tidak menambah jam terpakai (Jumat 16:00 -> Senin 09:00 = 120 menit)", () => {
    expect(workingMinutesBetween(wib(2026, 10, 23, 16), wib(2026, 10, 26, 9), NO_HOLIDAYS)).toBe(120)
    expect(workingMinutesBetween(wib(2026, 10, 24, 10), wib(2026, 10, 25, 10), NO_HOLIDAYS)).toBe(0)
    expect(workingMinutesOnWibDate(wib(2026, 10, 24, 12), NO_HOLIDAYS)).toBe(0)
  })

  it("Holiday pada hari kerja memotong hari itu; Holiday Sabtu tidak berpengaruh", () => {
    const mondayHoliday = [wib(2026, 10, 26)]
    expect(workingMinutesBetween(wib(2026, 10, 23, 16), wib(2026, 10, 27, 9), mondayHoliday)).toBe(120)
    expect(workingMinutesOnWibDate(wib(2026, 10, 26, 12), mondayHoliday)).toBe(0)
    const saturdayHoliday = [wib(2026, 10, 24)]
    expect(workingMinutesBetween(wib(2026, 10, 23, 16), wib(2026, 10, 26, 9), saturdayHoliday)).toBe(120)
  })

  it("tenggat Jumat 16:00 + 2 jam kerja = Senin 09:00; dibuat Sabtu mulai Senin 08:00", () => {
    expect(addWorkingMinutes(wib(2026, 10, 23, 16), 120, NO_HOLIDAYS).getTime()).toBe(
      wib(2026, 10, 26, 9).getTime(),
    )
    expect(addWorkingMinutes(wib(2026, 10, 24, 10), 120, NO_HOLIDAYS).getTime()).toBe(
      wib(2026, 10, 26, 10).getTime(),
    )
    expect(addWorkingMinutes(wib(2026, 10, 26, 8), 120, [wib(2026, 10, 26)]).getTime()).toBe(
      wib(2026, 10, 27, 10).getTime(),
    )
  })

  it("rentang kosong/terbalik = 0 dan tenggat 0 menit = from", () => {
    expect(workingMinutesBetween(wib(2026, 10, 26, 9), wib(2026, 10, 26, 8), NO_HOLIDAYS)).toBe(0)
    const from = wib(2026, 10, 26, 9)
    expect(addWorkingMinutes(from, 0, NO_HOLIDAYS).getTime()).toBe(from.getTime())
  })
})

describe("keadaan SLA per tiket", () => {
  it("open lewat-respons terbedakan dari in_progress lewat-resolusi", () => {
    const now = wib(2026, 10, 26, 13)
    const openLate = buildCrmTicketSla(
      [input({ id: 1, priority: "high", createdAt: wib(2026, 10, 26, 8) })],
      now,
      NO_HOLIDAYS,
    ).rows[0]
    expect(openLate.response.state).toBe("LEWAT")
    expect(openLate.response.usedMinutes).toBe(300)
    expect(openLate.resolution.state).toBe("DALAM_SLA")
    expect(openLate.primaryState).toBe("LEWAT_RESPONS")
    expect(openLate.response.dueAt?.getTime()).toBe(wib(2026, 10, 26, 10).getTime())

    const progressLate = buildCrmTicketSla(
      [
        input({
          id: 2,
          priority: "high",
          status: "in_progress",
          createdAt: wib(2026, 10, 23, 8),
          firstResponseAt: wib(2026, 10, 23, 9),
        }),
      ],
      now,
      NO_HOLIDAYS,
    ).rows[0]
    expect(progressLate.response.state).toBe("TERCAPAI")
    expect(progressLate.resolution.state).toBe("LEWAT")
    expect(progressLate.primaryState).toBe("LEWAT_RESOLUSI")
  })

  it("open lama tanpa respons: primer lewat-resolusi, kelebihan = maks kedua fase", () => {
    const row = buildCrmTicketSla(
      [input({ priority: "high", createdAt: wib(2026, 10, 23, 8) })],
      wib(2026, 10, 26, 13),
      NO_HOLIDAYS,
    ).rows[0]
    expect(row.response.state).toBe("LEWAT")
    expect(row.resolution.state).toBe("LEWAT")
    expect(row.primaryState).toBe("LEWAT_RESOLUSI")
    expect(row.response.usedMinutes).toBe(840)
    expect(row.overdueMinutes).toBe(840 - 120)
    expect(row.dueAt?.getTime()).toBe(row.resolution.dueAt?.getTime())
  })

  it("mendekati = sisa <= 25% belum lewat; batas persis 25% termasuk", () => {
    // medium respons 240: sisa 60 pada 180 menit terpakai.
    const near = buildCrmTicketSla(
      [input({ createdAt: wib(2026, 10, 26, 8) })],
      wib(2026, 10, 26, 11),
      NO_HOLIDAYS,
    ).rows[0]
    expect(near.response.state).toBe("MENDEKATI")
    expect(near.primaryState).toBe("MENDEKATI_RESPONS")
    const safe = buildCrmTicketSla(
      [input({ createdAt: wib(2026, 10, 26, 8) })],
      wib(2026, 10, 26, 10, 59),
      NO_HOLIDAYS,
    ).rows[0]
    expect(safe.response.state).toBe("DALAM_SLA")
  })

  it("prioritas liar/kosong/null/HIGH = medium + flag tak-dikenal, case-sensitive", () => {
    for (const priority of ["urgent", "HIGH", "", null] as const) {
      const row = buildCrmTicketSla([input({ priority })], wib(2026, 10, 26, 9), NO_HOLIDAYS).rows[0]
      expect(row.isUnknownPriority).toBe(true)
      expect(row.effectivePriorityKey).toBe("MEDIUM")
      expect(row.response.targetMinutes).toBe(240)
    }
    for (const priority of ["low", "medium", "high"] as const) {
      const row = buildCrmTicketSla([input({ priority })], wib(2026, 10, 26, 9), NO_HOLIDAYS).rows[0]
      expect(row.isUnknownPriority).toBe(false)
    }
  })

  it("deletedAt selalu dikecualikan; resolved historis terlambat tidak masuk antrean aktif", () => {
    const now = wib(2026, 10, 26, 13)
    const result = buildCrmTicketSla(
      [
        input({ id: 1, createdAt: wib(2026, 10, 23, 8), deletedAt: wib(2026, 10, 26, 9) }),
        input({
          id: 2,
          status: "resolved",
          priority: "high",
          createdAt: wib(2026, 10, 23, 8),
          firstResponseAt: wib(2026, 10, 23, 9),
          resolvedAt: wib(2026, 10, 26, 12),
        }),
        input({ id: 3, priority: "high", createdAt: wib(2026, 10, 23, 8) }),
      ],
      now,
      NO_HOLIDAYS,
    )
    expect(result.rows.map((r) => r.ticketId)).toEqual([2, 3])
    expect(result.rows[0].resolution.state).toBe("TERCAPAI")
    expect(result.overdueQueue.map((r) => r.ticketId)).toEqual([3])
    expect(result.summary.activeCount).toBe(1)
  })

  it("antrean: kelebihan terbesar dulu, seri ticketNumber lalu id", () => {
    const now = wib(2026, 10, 26, 13)
    const result = buildCrmTicketSla(
      [
        input({ id: 5, ticketNumber: "TK-0005", priority: "high", createdAt: wib(2026, 10, 26, 8) }),
        input({ id: 4, ticketNumber: "TK-0004", priority: "high", createdAt: wib(2026, 10, 23, 8) }),
        input({ id: 6, ticketNumber: null, priority: "high", createdAt: wib(2026, 10, 23, 8) }),
        input({ id: 3, ticketNumber: "TK-0003", priority: "high", createdAt: wib(2026, 10, 23, 8) }),
      ],
      now,
      NO_HOLIDAYS,
    )
    expect(result.overdueQueue.map((r) => r.ticketId)).toEqual([3, 4, 6, 5])
  })

  it("falsifikasi geser tenggat: tiket melewati tenggat muncul, dikembalikan hilang", () => {
    const ticket = input({ priority: "high", createdAt: wib(2026, 10, 26, 8) })
    const before = buildCrmTicketSla([ticket], wib(2026, 10, 26, 9, 59), NO_HOLIDAYS)
    const after = buildCrmTicketSla([ticket], wib(2026, 10, 26, 10, 1), NO_HOLIDAYS)
    expect(before.overdueQueue).toHaveLength(0)
    expect(after.overdueQueue).toHaveLength(1)
  })
})

describe("loader", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue(undefined)
    mocks.userFindMany.mockResolvedValue([{ id: 7, name: "Staf Uji" }])
    mocks.holidayFindMany.mockResolvedValue([])
    mocks.crmTicketFindMany.mockResolvedValue([])
  })

  it("izin view_tickets fail-closed sebelum query apa pun", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("Tidak punya izin"))
    await expect(getCrmTicketSla(wib(2026, 10, 26, 13))).rejects.toThrow("Tidak punya izin")
    expect(mocks.requirePermission).toHaveBeenCalledWith("view_tickets")
    expect(mocks.crmTicketFindMany).not.toHaveBeenCalled()
    expect(mocks.holidayFindMany).not.toHaveBeenCalled()
  })

  it("satu query massal aktif + Holiday + nama penanggung; nol mutasi", async () => {
    mocks.crmTicketFindMany.mockResolvedValue([
      {
        id: 1,
        slug: "tiket-1",
        ticketNumber: "TK-0001",
        subject: "Mesin mati",
        priority: "urgent",
        status: "open",
        customerName: "PT Uji",
        assignedTo: 7,
        firstResponseAt: null,
        resolvedAt: null,
        createdAt: wib(2026, 10, 26, 8),
        deletedAt: null,
      },
    ])
    mocks.holidayFindMany.mockResolvedValue([{ date: wib(2026, 10, 26) }])

    const result = await getCrmTicketSla(wib(2026, 10, 26, 13))

    expect(mocks.crmTicketFindMany).toHaveBeenCalledTimes(1)
    expect(mocks.crmTicketFindMany.mock.calls[0][0].where).toEqual({
      deletedAt: null,
      status: { in: ["open", "in_progress"] },
    })
    expect(mocks.holidayFindMany).toHaveBeenCalledTimes(1)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].assignedToName).toBe("Staf Uji")
    expect(result.rows[0].isUnknownPriority).toBe(true)
    // Senin libur: 0 menit terpakai walau now 13:00.
    expect(result.rows[0].response.usedMinutes).toBe(0)
    expect(mocks.crmTicketUpdate).not.toHaveBeenCalled()
    expect(mocks.crmTicketCreate).not.toHaveBeenCalled()
  })

  it("tanpa tiket aktif: query Holiday dilewati, hasil kosong", async () => {
    const result = await getCrmTicketSla(wib(2026, 10, 26, 13))
    expect(mocks.holidayFindMany).not.toHaveBeenCalled()
    expect(result.rows).toEqual([])
    expect(result.overdueQueue).toEqual([])
    expect(result.summary.activeCount).toBe(0)
  })
})
