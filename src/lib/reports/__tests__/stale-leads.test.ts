import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Daftar lead basi (F-2026-10-20-29(a)). Yang dijaga: hanya status
 * new/contacted yang dihitung, aktivitas terakhir = terbaru dari
 * completedAt/scheduledAt/createdAt (fallback Lead.createdAt), basi hanya
 * bila diam MELEBIHI ambang hari kalender, urut basi-terlama dulu, dan
 * loader satu query massal status aktif-saja (tanpa N+1).
 */

const mocks = vi.hoisted(() => ({
  prismaMock: {
    lead: { findMany: vi.fn() },
  },
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))

import { getStaleLeads } from "../stale-leads-data"
import { buildStaleLeads, type StaleLeadInput } from "../stale-leads"

const NOW = new Date(2026, 9, 20, 10, 0) // 20 Okt 2026 lokal

function input(over: Partial<StaleLeadInput>): StaleLeadInput {
  return {
    id: 1,
    slug: "lead-1",
    leadNumber: "LD-0001",
    name: "Budi",
    company: "PT Budi",
    status: "new",
    createdAt: new Date(2026, 9, 1),
    activities: [],
    ...over,
  }
}

describe("buildStaleLeads", () => {
  it("hanya new/contacted; status lain disaring walau diam lama", () => {
    const r = buildStaleLeads(
      [
        input({ id: 1, status: "new" }),
        input({ id: 2, status: "won" }),
        input({ id: 3, status: "qualified" }),
        input({ id: 4, status: "contacted" }),
      ],
      NOW,
    )
    expect(r.rows.map((row) => row.id)).toEqual([1, 4])
    expect(r.total).toBe(2)
    expect(r.thresholdDays).toBe(7)
  })

  it("tanpa aktivitas: fallback Lead.createdAt; tepat ambang belum basi", () => {
    const r = buildStaleLeads(
      [
        input({ id: 1, createdAt: new Date(2026, 9, 13) }), // 7 hari: belum basi
        input({ id: 2, createdAt: new Date(2026, 9, 12) }), // 8 hari: basi
      ],
      NOW,
    )
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0]).toMatchObject({ id: 2, idleDays: 8 })
    expect(r.rows[0].lastActivityAt).toEqual(new Date(2026, 9, 12))
  })

  it("aktivitas terakhir terbaru dari completed/scheduled/created; jadwal masa depan tak basi", () => {
    const r = buildStaleLeads(
      [
        input({
          id: 1,
          activities: [
            { completedAt: new Date(2026, 9, 18), scheduledAt: null, createdAt: new Date(2026, 9, 1) },
          ],
        }),
        input({
          id: 2,
          activities: [
            { completedAt: null, scheduledAt: new Date(2026, 9, 25), createdAt: new Date(2026, 9, 1) },
          ],
        }),
        input({
          id: 3,
          activities: [
            { completedAt: null, scheduledAt: null, createdAt: new Date(2026, 9, 5) },
          ],
        }),
      ],
      NOW,
    )
    expect(r.rows.map((row) => row.id)).toEqual([3])
    expect(r.rows[0].idleDays).toBe(15)
    expect(r.rows[0].lastActivityAt).toEqual(new Date(2026, 9, 5))
  })

  it("urut basi terlama dulu; seri diputus leadNumber lalu id", () => {
    const r = buildStaleLeads(
      [
        input({ id: 3, leadNumber: "LD-0003", createdAt: new Date(2026, 9, 2) }),
        input({ id: 1, leadNumber: "LD-0001", createdAt: new Date(2026, 9, 1) }),
        input({ id: 2, leadNumber: "LD-0002", createdAt: new Date(2026, 9, 2) }),
      ],
      NOW,
    )
    expect(r.rows.map((row) => row.id)).toEqual([1, 2, 3])
  })

  it("ambang kustom dihormati", () => {
    const r = buildStaleLeads([input({ id: 1, createdAt: new Date(2026, 9, 15) })], NOW, 3)
    expect(r.rows).toHaveLength(1)
    expect(r.thresholdDays).toBe(3)
  })
})

describe("getStaleLeads loader", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.prismaMock.lead.findMany.mockResolvedValue([
      {
        id: 7,
        slug: "lead-7",
        leadNumber: "LD-0007",
        name: "Sari",
        company: "PT Sari",
        status: "contacted",
        createdAt: new Date(2026, 9, 2),
        activities: [
          { completedAt: new Date(2026, 9, 10), scheduledAt: null, createdAt: new Date(2026, 9, 9) },
        ],
      },
      {
        id: 8,
        slug: null,
        leadNumber: null,
        name: "Andi",
        company: null,
        status: "new",
        createdAt: new Date(2026, 9, 19),
        activities: [],
      },
    ])
  })

  it("satu query status new/contacted + aktivitas terpetakan", async () => {
    const r = await getStaleLeads(NOW)
    expect(mocks.prismaMock.lead.findMany).toHaveBeenCalledTimes(1)
    expect(mocks.prismaMock.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: null, status: { in: ["new", "contacted"] } },
      }),
    )
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0]).toMatchObject({ id: 7, name: "Sari", idleDays: 10 })
    expect(r.rows[0].lastActivityAt).toEqual(new Date(2026, 9, 10))
  })
})
