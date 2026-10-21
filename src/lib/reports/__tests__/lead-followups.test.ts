import { describe, it, expect, vi } from "vitest"

/**
 * Antrean follow-up lead terjadwal (F-2026-10-21-037). Yang dijaga: hanya
 * aktivitas scheduledAt terisi + completedAt kosong dihitung; per lead
 * jadwal terawal terbuka; jatuh tempo hari ini masuk (overdueDays 0),
 * jadwal masa depan tidak; urut paling terlambat dulu; loader satu query
 * massal lead belum-terhapus (tanpa N+1).
 */

const mocks = vi.hoisted(() => ({
  prismaMock: { lead: { findMany: vi.fn() } },
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))

import { getLeadFollowUps } from "../lead-followups-data"
import { buildLeadFollowUps, type LeadFollowUpInput } from "../lead-followups"

const NOW = new Date(2026, 9, 21, 10, 0) // 21 Okt 2026 lokal

function input(over: Partial<LeadFollowUpInput>): LeadFollowUpInput {
  return {
    id: 1,
    slug: "lead-1",
    leadNumber: "LD-0001",
    name: "Budi",
    company: "PT Budi",
    status: "contacted",
    activities: [],
    ...over,
  }
}

function act(id: number, scheduledAt: Date | null, completedAt: Date | null = null) {
  return { id, type: "call", subject: `Telp ${id}`, scheduledAt, completedAt }
}

describe("buildLeadFollowUps", () => {
  it("jatuh tempo hari ini masuk overdueDays 0; masa depan tidak masuk", () => {
    const r = buildLeadFollowUps(
      [
        input({ id: 1, activities: [act(1, new Date(2026, 9, 21))] }),
        input({ id: 2, activities: [act(2, new Date(2026, 9, 22))] }),
      ],
      NOW,
    )
    expect(r.rows.map((row) => row.leadId)).toEqual([1])
    expect(r.rows[0].overdueDays).toBe(0)
    expect(r.total).toBe(1)
    expect(r.notice).toBeNull()
  })

  it("per lead jadwal terawal terbuka; yang selesai / tanpa jadwal diabaikan", () => {
    const r = buildLeadFollowUps(
      [
        input({
          id: 1,
          activities: [
            act(3, new Date(2026, 9, 19)),
            act(2, new Date(2026, 9, 15), new Date(2026, 9, 15)), // selesai
            act(1, new Date(2026, 9, 18)),
            act(4, null), // tanpa jadwal
          ],
        }),
      ],
      NOW,
    )
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0].activityId).toBe(1)
    expect(r.rows[0].overdueDays).toBe(3)
    expect(r.rows[0].openFollowUpCount).toBe(2)
  })

  it("urut paling terlambat dulu, seri leadNumber lalu id", () => {
    const r = buildLeadFollowUps(
      [
        input({ id: 3, leadNumber: "LD-0003", activities: [act(3, new Date(2026, 9, 11))] }),
        input({ id: 1, leadNumber: "LD-0001", activities: [act(1, new Date(2026, 9, 19))] }),
        input({ id: 2, leadNumber: "LD-0002", activities: [act(2, new Date(2026, 9, 11))] }),
      ],
      NOW,
    )
    expect(r.rows.map((row) => row.leadId)).toEqual([2, 3, 1])
  })

  it("kosong: notice jujur, total 0", () => {
    const r = buildLeadFollowUps([input({ id: 1, activities: [] })], NOW)
    expect(r.rows).toEqual([])
    expect(r.total).toBe(0)
    expect(r.notice).toMatch(/Tidak ada jadwal follow-up/)
  })

  it("loader: satu query lead deletedAt null + select ramping", async () => {
    mocks.prismaMock.lead.findMany.mockResolvedValue([
      {
        id: 9,
        slug: "lead-9",
        leadNumber: "LD-0009",
        name: "Sari",
        company: null,
        status: "new",
        activities: [act(9, new Date(2026, 9, 20))],
      },
    ])
    const r = await getLeadFollowUps(NOW)
    expect(mocks.prismaMock.lead.findMany).toHaveBeenCalledTimes(1)
    expect(mocks.prismaMock.lead.findMany.mock.calls[0][0].where).toEqual({ deletedAt: null })
    expect(mocks.prismaMock.lead.findMany.mock.calls[0][0].select.activities.select).toEqual({
      id: true,
      type: true,
      subject: true,
      scheduledAt: true,
      completedAt: true,
    })
    expect(r.rows[0].leadId).toBe(9)
    expect(r.rows[0].overdueDays).toBe(1)
  })
})
