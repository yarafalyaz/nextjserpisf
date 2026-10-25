import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Antrean follow-up lead terjadwal (F-2026-10-21-037; F-2026-10-25-047-S
 * Q-LFU-1 terputus Lead 2026-10-26 00:40 WIB). Yang dijaga: per lead hanya
 * jadwal terawal dengan scheduledAt <= hari ini kalender WIB dan
 * completedAt kosong yang tampil, jadwal besok tidak tampil, overdueDays
 * angka persis, urut overdue terbesar lalu leadNumber lalu leadId, lead
 * berstatus persis `lost` TIDAK tampil (Q-LFU-1) sedangkan `won` serta
 * ber-`convertedAt` berstatus bukan `lost` TETAP tampil, dan loader satu
 * query massal tanpa N+1 (pengecualian `lost` di builder, bukan filter
 * loader).
 */

const mocks = vi.hoisted(() => ({
  prismaMock: {
    lead: { findMany: vi.fn() },
  },
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))

import { getLeadFollowups } from "../lead-followups-data"
import { buildLeadFollowups, type LeadFollowupInput } from "../lead-followups"

const NOW = new Date(2026, 9, 21, 10, 0) // 21 Okt 2026 WIB

function input(over: Partial<LeadFollowupInput>): LeadFollowupInput {
  return {
    id: 1,
    slug: "lead-1",
    leadNumber: "LD-0001",
    name: "Budi",
    status: "new",
    activities: [
      { scheduledAt: new Date(2026, 9, 20), completedAt: null, createdAt: new Date(2026, 9, 19) },
    ],
    ...over,
  }
}

describe("buildLeadFollowups", () => {
  it("jadwal lewat tampil; overdueDays persis; jadwal besok tidak tampil", () => {
    const r = buildLeadFollowups(
      [
        input({
          id: 1,
          activities: [
            { scheduledAt: new Date(2026, 9, 14), completedAt: null, createdAt: new Date(2026, 9, 13) },
          ],
        }),
        input({
          id: 2,
          activities: [
            { scheduledAt: new Date(2026, 9, 22), completedAt: null, createdAt: new Date(2026, 9, 20) },
          ],
        }),
      ],
      NOW,
    )
    expect(r.total).toBe(1)
    expect(r.rows[0]).toMatchObject({ leadId: 1, overdueDays: 7 })
    expect(r.rows[0].scheduledAt).toEqual(new Date(2026, 9, 14))
  })

  it("jadwal hari ini tampil dengan overdueDays 0", () => {
    const r = buildLeadFollowups(
      [
        input({
          id: 1,
          activities: [
            { scheduledAt: new Date(2026, 9, 21, 23, 30), completedAt: null, createdAt: new Date(2026, 9, 20) },
          ],
        }),
      ],
      NOW,
    )
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0].overdueDays).toBe(0)
  })

  it("completedAt terisi tidak terhitung walau scheduledAt lewat", () => {
    const r = buildLeadFollowups(
      [
        input({
          id: 1,
          activities: [
            {
              scheduledAt: new Date(2026, 9, 10),
              completedAt: new Date(2026, 9, 11),
              createdAt: new Date(2026, 9, 9),
            },
          ],
        }),
      ],
      NOW,
    )
    expect(r.rows).toEqual([])
    expect(r.total).toBe(0)
  })

  it("per lead dipilih jadwal jatuh-tempo terawal; tanpa scheduledAt dilewati", () => {
    const r = buildLeadFollowups(
      [
        input({
          id: 1,
          activities: [
            { scheduledAt: new Date(2026, 9, 18), completedAt: null, createdAt: new Date(2026, 9, 17) },
            { scheduledAt: new Date(2026, 9, 15), completedAt: null, createdAt: new Date(2026, 9, 14) },
            { scheduledAt: new Date(2026, 9, 12), completedAt: new Date(2026, 9, 12), createdAt: new Date(2026, 9, 11) },
            { scheduledAt: null, completedAt: null, createdAt: new Date(2026, 9, 1) },
          ],
        }),
        input({ id: 2, activities: [] }),
      ],
      NOW,
    )
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0].scheduledAt).toEqual(new Date(2026, 9, 15))
    expect(r.rows[0].overdueDays).toBe(6)
  })

  it("Q-LFU-1 terbelah: won tampil, lost absen (ubahan disahkan putusan Lead 2026-10-26 00:40 WIB)", () => {
    const r = buildLeadFollowups(
      [
        input({ id: 1, status: "qualified" }),
        input({ id: 2, status: "won", leadNumber: "LD-0002" }),
        input({ id: 3, status: "lost", leadNumber: "LD-0003" }),
      ],
      NOW,
    )
    expect(r.total).toBe(2)
    expect(r.rows.map((row) => row.status)).toEqual(["qualified", "won"])
  })

  it("Q-LFU-1: lost berjadwal lewat absen dari awal, walau semua aktivitasnya belum selesai", () => {
    const r = buildLeadFollowups(
      [
        input({
          id: 1,
          status: "lost",
          activities: [
            { scheduledAt: new Date(2026, 9, 10), completedAt: null, createdAt: new Date(2026, 9, 9) },
          ],
        }),
      ],
      NOW,
    )
    expect(r.rows).toEqual([])
    expect(r.total).toBe(0)
  })

  it("Q-LFU-1: convertedAt berstatus bukan lost tetap tampil; status persis 'lost' absen", () => {
    const r = buildLeadFollowups(
      [
        input({ id: 1, status: "won", convertedAt: new Date(2026, 9, 15) }),
        input({
          id: 2,
          status: "qualified",
          leadNumber: "LD-0002",
          convertedAt: new Date(2026, 9, 15),
        }),
        input({ id: 3, status: "lost", leadNumber: "LD-0003", convertedAt: new Date(2026, 9, 15) }),
        input({ id: 4, status: "Lost", leadNumber: "LD-0004" }),
      ],
      NOW,
    )
    expect(r.total).toBe(3)
    expect(r.rows.map((row) => row.leadId)).toEqual([1, 2, 4])
  })

  it("urut overdue terbesar; seri diputus leadNumber lalu leadId", () => {
    const due = (day: number) => [
      { scheduledAt: new Date(2026, 9, day), completedAt: null, createdAt: new Date(2026, 9, 1) },
    ]
    const r = buildLeadFollowups(
      [
        input({ id: 5, leadNumber: "LD-0005", activities: due(19) }),
        input({ id: 3, leadNumber: "LD-0003", activities: due(19) }),
        input({ id: 4, leadNumber: null, activities: due(19) }),
        input({ id: 2, leadNumber: null, activities: due(19) }),
        input({ id: 1, leadNumber: "LD-0009", activities: due(11) }),
      ],
      NOW,
    )
    expect(r.rows.map((row) => row.leadId)).toEqual([1, 2, 4, 3, 5])
    expect(r.rows.map((row) => row.overdueDays)).toEqual([10, 2, 2, 2, 2])
  })
})

describe("getLeadFollowups loader", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.prismaMock.lead.findMany.mockResolvedValue([
      {
        id: 7,
        slug: "lead-7",
        leadNumber: "LD-0007",
        name: "Sari",
        status: "contacted",
        activities: [
          { scheduledAt: new Date(2026, 9, 18), completedAt: null, createdAt: new Date(2026, 9, 17) },
          { scheduledAt: new Date(2026, 9, 25), completedAt: null, createdAt: new Date(2026, 9, 18) },
        ],
      },
      {
        id: 8,
        slug: null,
        leadNumber: null,
        name: "Andi",
        status: "new",
        activities: [
          { scheduledAt: new Date(2026, 9, 10), completedAt: new Date(2026, 9, 10), createdAt: new Date(2026, 9, 9) },
        ],
      },
    ])
  })

  it("satu query massal tanpa filter status + aktivitas terpetakan (Q-LFU-1 disaring builder)", async () => {
    const r = await getLeadFollowups(NOW)
    expect(mocks.prismaMock.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ convertedAt: true }),
      }),
    )
    expect(mocks.prismaMock.lead.findMany).toHaveBeenCalledTimes(1)
    expect(mocks.prismaMock.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deletedAt: null } }),
    )
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0]).toMatchObject({ leadId: 7, name: "Sari", overdueDays: 3 })
    expect(r.rows[0].scheduledAt).toEqual(new Date(2026, 9, 18))
  })
})
