import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Rekap beban tiket F-2026-10-25-033-S lapis aman (baca-saja).
 * Dijaga: populasi = populasi 032-S persis (B1); ember Belum ditugaskan
 * selalu pertama dan tampil walau kosong (B2); penanggung tak ditemukan
 * `Pengguna #<id>` terpisah (B3); rincian prioritas menjumlah ke total
 * termasuk tak-dikenal (B4); tertua dari createdAt (B5); loader delegasi
 * ke loader 032 (izin + satu query massal) (B6).
 */

const mocks = vi.hoisted(() => ({
  crmTicketFindMany: vi.fn(),
  userFindMany: vi.fn(),
  requirePermission: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    crmTicket: { findMany: (...a: unknown[]) => mocks.crmTicketFindMany(...a) },
    user: { findMany: (...a: unknown[]) => mocks.userFindMany(...a) },
  },
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermission(...a),
}))

import { buildCrmTicketQueue, type CrmTicketQueueInput } from "../crm-ticket-queue"
import {
  buildCrmTicketWorkload,
  CRM_TICKET_WORKLOAD_EMPTY_NAMED_TEXT,
  CRM_TICKET_WORKLOAD_NOTICE_TEXT,
} from "../crm-ticket-workload"
import { getCrmTicketWorkload } from "../crm-ticket-workload-data"

const NOW = new Date("2026-10-26T05:00:00.000Z")

function input(over: Partial<CrmTicketQueueInput>): CrmTicketQueueInput {
  return {
    id: 1, slug: "tiket-1", ticketNumber: "TK-0001", subject: "Mesin mati",
    priority: "medium", status: "open", customerName: "Budi",
    assignedTo: 7, assignedToName: "Sari", firstResponseAt: null,
    createdAt: new Date("2026-10-20T05:00:00.000Z"), deletedAt: null,
    ...over,
  }
}

function workload(inputs: CrmTicketQueueInput[]) {
  return buildCrmTicketWorkload(buildCrmTicketQueue(inputs, NOW).rows, NOW)
}

describe("buildCrmTicketWorkload", () => {
  it("B1: terminal/terhapus keluar; total rekap = total antrean 032-S", () => {
    const inputs = [
      input({ id: 1, status: "resolved", priority: "high" }),
      input({ id: 2, status: "closed", priority: "high" }),
      input({ id: 3, status: "open", priority: "high", deletedAt: new Date() }),
      input({ id: 4, status: "in_progress", priority: "low" }),
    ]
    const queue = buildCrmTicketQueue(inputs, NOW)
    const r = workload(inputs)
    expect(r.groups).toEqual([
      expect.objectContaining({ assignedTo: null, totalOpen: 0 }),
      expect.objectContaining({ assignedTo: 7, totalOpen: 1 }),
    ])
    expect(r.summary.totalOpen).toBe(queue.summary.totalOpen)
  })

  it("B2: ember Belum ditugaskan pertama, tampil walau kosong", () => {
    const r = workload([
      input({ id: 1, assignedTo: 7, assignedToName: "Sari", priority: "high" }),
    ])
    expect(r.groups[0]).toMatchObject({ assignedTo: null, assigneeLabel: "Belum ditugaskan", totalOpen: 0 })
    expect(r.summary.unassignedCount).toBe(0)
    expect(r.groups.some((g) => g.assigneeLabel === "Belum ditugaskan" && g.assignedTo === null)).toBe(true)
  })

  it("B3: assignedTo tanpa User = Pengguna #<id>, tidak digabung ke Belum ditugaskan", () => {
    const r = workload([input({ id: 1, assignedTo: 99, assignedToName: null })])
    expect(r.groups).toEqual([
      expect.objectContaining({ assignedTo: null, totalOpen: 0 }),
      expect.objectContaining({ assignedTo: 99, assigneeLabel: "Pengguna #99", totalOpen: 1 }),
    ])
  })

  it("B4: rincian prioritas menjumlah ke total kelompok; prioritas liar masuk tak-dikenal, bukan medium", () => {
    const r = workload([
      input({ id: 1, priority: "high" }),
      input({ id: 2, priority: "medium" }),
      input({ id: 3, priority: "low" }),
      input({ id: 4, priority: "aneh" }),
    ])
    const g = r.groups.find((x) => x.assignedTo === 7)!
    expect(g).toMatchObject({
      totalOpen: 4, highCount: 1, mediumCount: 1, lowCount: 1, unknownPriorityCount: 1,
    })
    expect(g.highCount + g.mediumCount + g.lowCount + g.unknownPriorityCount).toBe(g.totalOpen)
  })

  it("B5: tertua dari createdAt; in_progress sudah direspons tidak terhitung belum direspons", () => {
    const oldest = new Date("2026-10-01T00:00:00.000Z")
    const r = workload([
      input({ id: 1, createdAt: new Date("2026-10-20T00:00:00.000Z") }),
      input({ id: 2, createdAt: oldest, status: "in_progress", firstResponseAt: null }),
    ])
    const g = r.groups.find((x) => x.assignedTo === 7)!
    expect(g.oldestCreatedAt).toEqual(oldest)
    expect(g.oldestAgeMs).toBe(NOW.getTime() - oldest.getTime())
    expect(g.unrespondedCount).toBe(1) // hanya id 1 (open tanpa firstResponseAt)
    expect(r.ageLabel).toBe("Umur sejak dibuat")
  })

  it("nama sama persis dibedakan id (EC-CTB-4); urutan deterministik BR-CTB-05", () => {
    const r = workload([
      input({ id: 1, assignedTo: 9, assignedToName: "Sari", priority: "low" }),
      input({ id: 2, assignedTo: 7, assignedToName: "Sari", priority: "high" }),
      input({ id: 3, assignedTo: null, assignedToName: null, priority: "low" }),
    ])
    expect(r.groups.map((g) => g.assignedTo)).toEqual([null, 7, 9])
  })

  it("hanya ember + teks kosong bernama jujur ketika semua belum ditugaskan (EC-CTB-1)", () => {
    const r = workload([input({ id: 1, assignedTo: null, assignedToName: null })])
    expect(r.groups).toHaveLength(1)
    expect(r.groups[0]).toMatchObject({ assignedTo: null, totalOpen: 1 })
    expect(r.emptyNamedText).toBe("Tidak ada penanggung jawab dengan tiket terbuka")
  })

  it("nol kata kinerja/peringkat di teks builder (BR-CTB-07)", () => {
    const r = workload([])
    expect(JSON.stringify(r)).not.toMatch(/Kinerja|Peringkat|Terbaik|Terburuk|kuota|target/i)
    expect(CRM_TICKET_WORKLOAD_NOTICE_TEXT).toContain("pembagian beban operasional")
    expect(CRM_TICKET_WORKLOAD_EMPTY_NAMED_TEXT).toBeTruthy()
  })
})

describe("getCrmTicketWorkload (loader)", () => {
  beforeEach(() => {
    mocks.crmTicketFindMany.mockReset()
    mocks.userFindMany.mockReset()
    mocks.requirePermission.mockReset()
    mocks.requirePermission.mockResolvedValue(undefined)
  })

  it("B6: izin view_tickets + satu query massal populasi 032-S yang sama, total konsisten", async () => {
    mocks.userFindMany.mockResolvedValue([{ id: 7, name: "Sari" }])
    mocks.crmTicketFindMany.mockResolvedValue([
      { id: 11, slug: "tk-a", ticketNumber: "TK-0011", subject: "AC mati", priority: "high", status: "open", customerName: "Citra", assignedTo: 7, firstResponseAt: null, createdAt: new Date("2026-10-24T00:00:00.000Z"), deletedAt: null },
      { id: 12, slug: "tk-b", ticketNumber: "TK-0012", subject: "Rem", priority: "low", status: "in_progress", customerName: null, assignedTo: null, firstResponseAt: null, createdAt: new Date("2026-10-25T00:00:00.000Z"), deletedAt: null },
    ])
    const r = await getCrmTicketWorkload(NOW)
    expect(mocks.requirePermission).toHaveBeenCalledWith("view_tickets")
    expect(mocks.crmTicketFindMany).toHaveBeenCalledTimes(1)
    expect(mocks.crmTicketFindMany.mock.calls[0][0].where).toEqual({
      deletedAt: null, status: { in: ["open", "in_progress"] },
    })
    expect(r.summary).toEqual({ totalOpen: 2, unassignedCount: 1 })
    expect(r.groups.map((g) => g.assignedTo)).toEqual([null, 7])
    expect(r.groups[1].assigneeLabel).toBe("Sari")
  })

  it("tanpa izin: gagal sebelum query (fail-closed)", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("Tidak memiliki izin"))
    await expect(getCrmTicketWorkload(NOW)).rejects.toThrow("Tidak memiliki izin")
    expect(mocks.crmTicketFindMany).not.toHaveBeenCalled()
    expect(mocks.userFindMany).not.toHaveBeenCalled()
  })
})
