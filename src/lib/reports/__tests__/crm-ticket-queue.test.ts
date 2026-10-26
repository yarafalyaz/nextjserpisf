import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Antrean tiket CRM terbuka F-2026-10-25-032-S lapis aman (baca-saja).
 * Yang dijaga: populasi BR-CTQ-02 (terminal/terhapus keluar baris DAN
 * hitungan, AC-CTQ-B1); urutan BR-CTQ-04 deterministik (AC-CTQ-B2);
 * prioritas liar tingkat terakhir tertanda, nol normalisasi (AC-CTQ-B3);
 * umur hanya dari createdAt/now, updatedAt tidak dibaca (AC-CTQ-B4);
 * ringkasan = hitungan baris yang sama (AC-CTQ-B6/BR-CTQ-10); loader
 * satu query massal + izin view_tickets fail-closed + nol mutasi
 * (AC-CTQ-B5). Tanpa target/ambang/kata "Terlambat" (BR-CTQ-07).
 */

const mocks = vi.hoisted(() => ({
  crmTicketFindMany: vi.fn(),
  crmTicketUpdate: vi.fn(),
  crmTicketCreate: vi.fn(),
  crmTicketCommentCreate: vi.fn(),
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
    crmTicketComment: {
      create: (...a: unknown[]) => mocks.crmTicketCommentCreate(...a),
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
  buildCrmTicketQueue,
  CRM_TICKET_PRIORITY_LABELS,
  CRM_TICKET_QUEUE_AGE_LABEL,
  CRM_TICKET_QUEUE_EMPTY_TEXT,
  type CrmTicketQueueInput,
} from "../crm-ticket-queue"
import { getCrmTicketQueue } from "../crm-ticket-queue-data"

const NOW = new Date("2026-10-26T05:00:00.000Z")

function input(over: Partial<CrmTicketQueueInput>): CrmTicketQueueInput {
  return {
    id: 1,
    slug: "tiket-1",
    ticketNumber: "TK-0001",
    subject: "Mesin mati",
    priority: "medium",
    status: "open",
    customerName: "Budi",
    assignedTo: 7,
    assignedToName: "Sari",
    firstResponseAt: null,
    createdAt: new Date("2026-10-20T05:00:00.000Z"),
    deletedAt: null,
    ...over,
  }
}

describe("buildCrmTicketQueue", () => {
  it("AC-CTQ-B1: resolved/closed/terhapus high tertua TIDAK muncul di baris maupun hitungan", () => {
    const r = buildCrmTicketQueue(
      [
        input({ id: 1, status: "resolved", priority: "high", createdAt: new Date("2026-01-01T00:00:00.000Z") }),
        input({ id: 2, status: "closed", priority: "high", createdAt: new Date("2026-01-01T00:00:00.000Z") }),
        input({ id: 3, status: "open", priority: "high", deletedAt: new Date("2026-10-01T00:00:00.000Z") }),
        input({ id: 4, status: "in_progress", priority: "low" }),
      ],
      NOW,
    )
    expect(r.rows.map((x) => x.ticketId)).toEqual([4])
    expect(r.summary).toMatchObject({ totalOpen: 1, highCount: 0, lowCount: 1 })
  })

  it("AC-CTQ-B2/BR-CTQ-04: high muda di atas low tua; seri tingkat sama = createdAt tertua, ticketNumber null terakhir, id", () => {
    const r = buildCrmTicketQueue(
      [
        input({ id: 5, priority: "low", createdAt: new Date("2026-01-01T00:00:00.000Z"), ticketNumber: "TK-0005" }),
        input({ id: 2, priority: "high", createdAt: new Date("2026-10-25T00:00:00.000Z"), ticketNumber: "TK-0002" }),
        input({ id: 4, priority: "high", createdAt: new Date("2026-10-20T00:00:00.000Z"), ticketNumber: null }),
        input({ id: 3, priority: "high", createdAt: new Date("2026-10-20T00:00:00.000Z"), ticketNumber: "TK-0009" }),
        input({ id: 1, priority: "high", createdAt: new Date("2026-10-20T00:00:00.000Z"), ticketNumber: "TK-0001" }),
        input({ id: 6, priority: "high", createdAt: new Date("2026-10-20T00:00:00.000Z"), ticketNumber: "TK-0001" }),
      ],
      NOW,
    )
    expect(r.rows.map((x) => x.ticketId)).toEqual([1, 6, 3, 4, 2, 5])
  })

  it("status liar tampil sesudah in_progress dalam tingkatnya, tertanda Status tidak dikenal (EC-CTQ-5)", () => {
    const r = buildCrmTicketQueue(
      [
        input({ id: 1, status: "pending", priority: "high", createdAt: new Date("2026-01-01T00:00:00.000Z") }),
        input({ id: 2, status: "in_progress", priority: "high", createdAt: new Date("2026-10-25T00:00:00.000Z") }),
        input({ id: 3, status: "open", priority: "low", createdAt: new Date("2026-10-25T00:00:00.000Z") }),
      ],
      NOW,
    )
    expect(r.rows.map((x) => x.ticketId)).toEqual([2, 1, 3])
    expect(r.rows[1]).toMatchObject({ isUnknownStatus: true, statusLabel: "Status tidak dikenal" })
    expect(r.summary.totalOpen).toBe(3)
  })

  it("AC-CTQ-B3/BR-CTQ-03: prioritas liar (HIGH/urgent/kosong/null) tingkat terakhir tertanda, bukan medium", () => {
    const r = buildCrmTicketQueue(
      [
        input({ id: 1, priority: "HIGH" }),
        input({ id: 2, priority: "urgent" }),
        input({ id: 3, priority: "" }),
        input({ id: 4, priority: null }),
        input({ id: 5, priority: "low", createdAt: new Date("2026-10-25T00:00:00.000Z") }),
      ],
      NOW,
    )
    expect(r.rows.map((x) => x.ticketId)).toEqual([5, 1, 2, 3, 4])
    expect(r.rows.slice(1).every((x) => x.priorityKey === "UNKNOWN")).toBe(true)
    expect(CRM_TICKET_PRIORITY_LABELS.UNKNOWN).toBe("Prioritas tak dikenal")
    expect(r.rows.slice(1).every((x) => x.priorityLabel === "Prioritas tak dikenal")).toBe(true)
    expect(r.summary).toMatchObject({ mediumCount: 0, unknownPriorityCount: 4, lowCount: 1 })
  })

  it("label prioritas sah verbatim form existing: Tinggi/Sedang/Rendah", () => {
    const r = buildCrmTicketQueue(
      [
        input({ id: 1, priority: "high" }),
        input({ id: 2, priority: "medium" }),
        input({ id: 3, priority: "low" }),
      ],
      NOW,
    )
    expect(r.rows.map((x) => x.priorityLabel)).toEqual(["Tinggi", "Sedang", "Rendah"])
    expect(r.rows.map((x) => x.statusLabel)).toEqual(["Terbuka", "Terbuka", "Terbuka"])
  })

  it("AC-CTQ-B4/BR-CTQ-05: umur hanya createdAt vs now; label persis Umur sejak dibuat; tanpa kata Terlambat", () => {
    const created = new Date("2026-10-20T05:00:00.000Z")
    const r = buildCrmTicketQueue([input({ createdAt: created })], NOW)
    expect(r.rows[0].ageMs).toBe(NOW.getTime() - created.getTime())
    // Gabungan teks permukaan builder: nol kata terlarang BR-CTQ-05/07.
    const surface = JSON.stringify(r)
    expect(surface).not.toMatch(/Terlambat|Lewat SLA/i)
    expect(r.ageLabel).toBe("Umur sejak dibuat")
    expect(CRM_TICKET_QUEUE_AGE_LABEL).toBe("Umur sejak dibuat")
    // Input builder tidak punya updatedAt sama sekali: sumber umur tunggal.
    expect(Object.keys(input({})).sort()).not.toContain("updatedAt")
  })

  it("umur negatif (createdAt masa depan) dijepit 0, bukan umur negatif karangan", () => {
    const r = buildCrmTicketQueue(
      [input({ createdAt: new Date("2027-01-01T00:00:00.000Z") })],
      NOW,
    )
    expect(r.rows[0].ageMs).toBe(0)
  })

  it("AC-CTQ-B6/BR-CTQ-10: ringkasan sama dengan baris (per tingkat + belum ditugaskan + belum direspons)", () => {
    const r = buildCrmTicketQueue(
      [
        input({ id: 1, priority: "high", assignedTo: null, assignedToName: null, status: "open", firstResponseAt: null }),
        input({ id: 2, priority: "high", status: "open", firstResponseAt: new Date("2026-10-21T00:00:00.000Z") }),
        input({ id: 3, priority: "medium", status: "in_progress", firstResponseAt: null }),
        input({ id: 4, priority: "aneh", assignedTo: null, assignedToName: null, status: "open", firstResponseAt: null }),
      ],
      NOW,
    )
    expect(r.summary).toEqual({
      totalOpen: 4,
      highCount: 2,
      mediumCount: 1,
      lowCount: 0,
      unknownPriorityCount: 1,
      unassignedCount: 2,
      unrespondedCount: 2,
    })
    expect(r.rows.filter((x) => x.isUnresponded).map((x) => x.ticketId)).toEqual([1, 4])
    expect(
      r.summary.highCount + r.summary.mediumCount + r.summary.lowCount + r.summary.unknownPriorityCount,
    ).toBe(r.rows.length)
  })

  it("EC-CTQ-1/BR-CTQ-09: tanpa penanggung + tanpa pelanggan tetap tampil tertanda", () => {
    const r = buildCrmTicketQueue(
      [input({ assignedTo: null, assignedToName: null, customerName: null })],
      NOW,
    )
    expect(r.rows[0]).toMatchObject({
      assigneeLabel: "Belum ditugaskan",
      customerLabel: "—",
      customerName: null,
    })
  })

  it("penanggung id ada tapi nama tak ditemukan: fallback Pengguna #<id> existing, bukan Belum ditugaskan", () => {
    const r = buildCrmTicketQueue([input({ assignedTo: 99, assignedToName: null })], NOW)
    expect(r.rows[0].assigneeLabel).toBe("Pengguna #99")
    expect(r.summary.unassignedCount).toBe(0)
  })

  it("EC-CTQ-6: antrean kosong sah = rows kosong + teks kosong jujur verbatim", () => {
    const r = buildCrmTicketQueue([], NOW)
    expect(r.rows).toEqual([])
    expect(r.summary.totalOpen).toBe(0)
    expect(r.emptyText).toBe("Tidak ada tiket terbuka")
    expect(CRM_TICKET_QUEUE_EMPTY_TEXT).toBe("Tidak ada tiket terbuka")
  })
})

describe("getCrmTicketQueue (loader)", () => {
  beforeEach(() => {
    mocks.crmTicketFindMany.mockReset()
    mocks.userFindMany.mockReset()
    mocks.requirePermission.mockReset()
    mocks.requirePermission.mockResolvedValue(undefined)
  })

  it("AC-CTQ-B5: satu query massal populasi + satu query user, nol mutasi", async () => {
    mocks.userFindMany.mockResolvedValue([{ id: 9, name: "Rina" }])
    mocks.crmTicketFindMany.mockResolvedValue([
      {
        id: 11, slug: "tk-a", ticketNumber: "TK-0011", subject: "AC mati", priority: "high",
        status: "open", customerName: "Citra", assignedTo: 9, firstResponseAt: null,
        createdAt: new Date("2026-10-24T00:00:00.000Z"), deletedAt: null,
      },
      {
        id: 12, slug: "tk-b", ticketNumber: "TK-0012", subject: "Rem bunyi", priority: "low",
        status: "in_progress", customerName: null, assignedTo: null,
        firstResponseAt: new Date("2026-10-24T01:00:00.000Z"),
        createdAt: new Date("2026-10-25T00:00:00.000Z"), deletedAt: null,
      },
    ])
    const r = await getCrmTicketQueue(NOW)
    expect(mocks.requirePermission).toHaveBeenCalledWith("view_tickets")
    expect(mocks.crmTicketFindMany).toHaveBeenCalledTimes(1)
    expect(mocks.crmTicketFindMany.mock.calls[0][0].where).toEqual({
      deletedAt: null,
      status: { in: ["open", "in_progress"] },
    })
    expect(mocks.userFindMany).toHaveBeenCalledTimes(1)
    expect(r.rows.map((x) => x.ticketId)).toEqual([11, 12])
    expect(r.rows[0]).toMatchObject({ assignedToName: "Rina", assigneeLabel: "Rina", priorityLabel: "Tinggi" })
    expect(mocks.crmTicketUpdate).not.toHaveBeenCalled()
    expect(mocks.crmTicketCreate).not.toHaveBeenCalled()
    expect(mocks.crmTicketCommentCreate).not.toHaveBeenCalled()
  })

  it("tanpa izin view_tickets: loader gagal sebelum query apa pun (fail-closed)", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("Tidak memiliki izin"))
    await expect(getCrmTicketQueue(NOW)).rejects.toThrow("Tidak memiliki izin")
    expect(mocks.crmTicketFindMany).not.toHaveBeenCalled()
    expect(mocks.userFindMany).not.toHaveBeenCalled()
  })

  it("loader tanpa penanggung: query user dilewati, label Belum ditugaskan", async () => {
    mocks.crmTicketFindMany.mockResolvedValue([
      {
        id: 21, slug: "tk-c", ticketNumber: "TK-0021", subject: "Lampu mati", priority: "medium",
        status: "open", customerName: "Eka", assignedTo: null, firstResponseAt: null,
        createdAt: new Date("2026-10-25T00:00:00.000Z"), deletedAt: null,
      },
    ])
    const r = await getCrmTicketQueue(NOW)
    expect(mocks.userFindMany).not.toHaveBeenCalled()
    expect(r.rows[0]).toMatchObject({ assignedToName: null, assigneeLabel: "Belum ditugaskan" })
  })
})
