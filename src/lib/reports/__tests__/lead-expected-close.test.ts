import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Antrean prospek target tutup F-2026-10-25-027-S (AC-EC-B1..B7).
 * Yang dijaga: won/lost/terhapus tidak bocor (B1); batas hari WIB persis
 * hari ini = MENDEKATI sisa 0, kemarin = LEWAT overdue 1, lintas tengah
 * malam WIB (B2); expectedCloseDate kosong = TANPA_TARGET tanpa 0
 * karangan (B3); nol probabilitas/persen di keluaran (B4); urutan
 * BR-EC-06 deterministik (B5); loader 1 query massal nol mutasi (B6);
 * estimatedValue kosong di luar Σ (B7). Jendela eksplisit Q-EC-1 = 7.
 */

const mocks = vi.hoisted(() => ({
  prismaMock: {
    lead: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
  },
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))

import {
  buildLeadExpectedCloseQueue,
  LEAD_EXPECTED_CLOSE_BUCKET_LABELS,
  LEAD_EXPECTED_CLOSE_VALUE_NOTICE_TEXT,
  LEAD_EXPECTED_CLOSE_WINDOW_DAYS,
  type LeadExpectedCloseInput,
} from "../lead-expected-close"
import { getLeadExpectedCloseQueue } from "../lead-expected-close-data"

const NOW = new Date(2026, 9, 26, 10, 0) // 26 Okt 2026 10:00 WIB

function input(over: Partial<LeadExpectedCloseInput>): LeadExpectedCloseInput {
  return {
    id: 1,
    slug: "lead-1",
    leadNumber: "LD-0001",
    name: "Budi",
    status: "new",
    expectedCloseDate: new Date(2026, 9, 26),
    estimatedValue: 100,
    assignedTo: 7,
    assignedToName: "Sari",
    deletedAt: null,
    ...over,
  }
}

describe("buildLeadExpectedCloseQueue", () => {
  it("AC-EC-B1: won/lost/terhapus dengan target lampau TIDAK muncul", () => {
    const past = new Date(2026, 9, 20)
    const r = buildLeadExpectedCloseQueue(
      [
        input({ id: 1, status: "won", expectedCloseDate: past }),
        input({ id: 2, status: "lost", expectedCloseDate: past }),
        input({ id: 3, status: "new", expectedCloseDate: past, deletedAt: new Date(2026, 9, 21) }),
        input({ id: 4, status: "new", expectedCloseDate: past }),
      ],
      NOW,
    )
    expect(r.rows.map((x) => x.leadId)).toEqual([4])
    expect(r.totalInQueue).toBe(1)
  })

  it("AC-EC-B2: hari ini = MENDEKATI sisa 0; kemarin = LEWAT overdue 1; besok dalam jendela", () => {
    const r = buildLeadExpectedCloseQueue(
      [
        input({ id: 1, expectedCloseDate: new Date(2026, 9, 26, 23, 59) }),
        input({ id: 2, expectedCloseDate: new Date(2026, 9, 25) }),
        input({ id: 3, expectedCloseDate: new Date(2026, 9, 27) }),
      ],
      NOW,
    )
    const byId = new Map(r.rows.map((x) => [x.leadId, x]))
    expect(byId.get(1)).toMatchObject({ bucket: "MENDEKATI", remainingDays: 0, overdueDays: null })
    expect(byId.get(2)).toMatchObject({ bucket: "LEWAT_TARGET", overdueDays: 1, remainingDays: null })
    expect(byId.get(3)).toMatchObject({ bucket: "MENDEKATI", remainingDays: 1 })
  })

  it("AC-EC-B2 lintas tengah malam WIB: 00:30 WIB target kemarin sudah LEWAT 1", () => {
    const r = buildLeadExpectedCloseQueue(
      [input({ id: 1, expectedCloseDate: new Date(2026, 9, 26) })],
      new Date(2026, 9, 27, 0, 30),
    )
    expect(r.rows[0]).toMatchObject({ bucket: "LEWAT_TARGET", overdueDays: 1 })
  })

  it("jendela default 7: +7 masuk, +8 keluar; jendela eksplisit mengubah tanpa migrasi", () => {
    const leads = [
      input({ id: 1, expectedCloseDate: new Date(2026, 10, 2) }), // +7
      input({ id: 2, expectedCloseDate: new Date(2026, 10, 3) }), // +8
    ]
    expect(LEAD_EXPECTED_CLOSE_WINDOW_DAYS).toBe(7)
    expect(buildLeadExpectedCloseQueue(leads, NOW).rows.map((x) => x.leadId)).toEqual([1])
    expect(buildLeadExpectedCloseQueue(leads, NOW, 30).rows.map((x) => x.leadId)).toEqual([1, 2])
    expect(buildLeadExpectedCloseQueue(leads, NOW, 30).windowDays).toBe(30)
  })

  it("AC-EC-B3: tanpa target = TANPA_TARGET terpisah tanpa sisa/overdue karangan", () => {
    const r = buildLeadExpectedCloseQueue(
      [input({ id: 1, expectedCloseDate: null }), input({ id: 2 })],
      NOW,
    )
    expect(r.rows.map((x) => x.leadId)).toEqual([2])
    expect(r.withoutTargetRows).toHaveLength(1)
    expect(r.withoutTargetRows[0]).toMatchObject({
      bucket: "TANPA_TARGET",
      overdueDays: null,
      remainingDays: null,
      expectedCloseDate: null,
    })
    expect(r.totalWithoutTarget).toBe(1)
  })

  it("AC-EC-B4: keluaran tanpa probabilitas/persen/prediksi di field mana pun", () => {
    const r = buildLeadExpectedCloseQueue([input({})], NOW)
    const keys: string[] = []
    const walk = (v: unknown) => {
      if (v && typeof v === "object") {
        for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
          keys.push(k)
          walk(val)
        }
      }
    }
    walk(r)
    expect(keys.some((k) => /probab|percent|persen|peluang|prediksi|forecast|weight/i.test(k))).toBe(false)
    expect(r.valueNotice).toBe(LEAD_EXPECTED_CLOSE_VALUE_NOTICE_TEXT)
    expect(r.valueNotice).toContain("bukan piutang, pendapatan, atau prediksi")
  })

  it("AC-EC-B5: urutan LEWAT overdue desc lalu MENDEKATI sisa asc; seri leadNumber lalu id", () => {
    const r = buildLeadExpectedCloseQueue(
      [
        input({ id: 5, leadNumber: "LD-0005", expectedCloseDate: new Date(2026, 9, 28) }), // sisa 2
        input({ id: 2, leadNumber: "LD-0002", expectedCloseDate: new Date(2026, 9, 20) }), // lewat 6
        input({ id: 3, leadNumber: "LD-0003", expectedCloseDate: new Date(2026, 9, 23) }), // lewat 3
        input({ id: 4, leadNumber: "LD-0004", expectedCloseDate: new Date(2026, 9, 23) }), // lewat 3 seri
        input({ id: 1, leadNumber: "LD-0001", expectedCloseDate: new Date(2026, 9, 26) }), // sisa 0
      ],
      NOW,
    )
    expect(r.rows.map((x) => x.leadId)).toEqual([2, 3, 4, 1, 5])
    // Urutan identik walau input dibalik (deterministik, bukan urutan input).
    const rev = buildLeadExpectedCloseQueue(
      [
        input({ id: 1, leadNumber: "LD-0001", expectedCloseDate: new Date(2026, 9, 26) }),
        input({ id: 4, leadNumber: "LD-0004", expectedCloseDate: new Date(2026, 9, 23) }),
        input({ id: 3, leadNumber: "LD-0003", expectedCloseDate: new Date(2026, 9, 23) }),
        input({ id: 2, leadNumber: "LD-0002", expectedCloseDate: new Date(2026, 9, 20) }),
        input({ id: 5, leadNumber: "LD-0005", expectedCloseDate: new Date(2026, 9, 28) }),
      ],
      NOW,
    )
    expect(rev.rows.map((x) => x.leadId)).toEqual([2, 3, 4, 1, 5])
  })

  it("AC-EC-B7: estimatedValue kosong di luar Σ, tertanda label funnel, bukan Rp0", () => {
    const r = buildLeadExpectedCloseQueue(
      [
        input({ id: 1, estimatedValue: 250.5, expectedCloseDate: new Date(2026, 9, 25) }),
        input({ id: 2, estimatedValue: null, expectedCloseDate: new Date(2026, 9, 25) }),
      ],
      NOW,
    )
    const bucket = r.buckets.find((b) => b.bucket === "LEWAT_TARGET")!
    expect(bucket.totalEstimatedValue).toBe(250.5)
    expect(bucket.noValueCount).toBe(1)
    expect(bucket.count).toBe(2)
    const noVal = r.rows.find((x) => x.leadId === 2)!
    expect(noVal).toMatchObject({ hasEstimatedValue: false, estimatedValue: null, noValueLabel: "Prospek tanpa nilai estimasi" })
  })

  it("status liar tampil tertanda tidak dikenal; tanpa penanggung label funnel", () => {
    const r = buildLeadExpectedCloseQueue(
      [input({ id: 1, status: "aneh", assignedTo: null, assignedToName: null })],
      NOW,
    )
    expect(r.rows[0]).toMatchObject({
      stageLabel: "Status tidak dikenal",
      isUnknownStatus: true,
      assigneeLabel: "Belum ditugaskan",
    })
    expect(LEAD_EXPECTED_CLOSE_BUCKET_LABELS.MENDEKATI).toBe("Mendekati target tutup")
  })

  it("tahun kabisat: 29 Feb ke 1 Mar = sisa 1 (EC-6)", () => {
    const r = buildLeadExpectedCloseQueue(
      [input({ id: 1, expectedCloseDate: new Date(2028, 2, 1) })],
      new Date(2028, 1, 29, 9, 0),
    )
    expect(r.rows[0]).toMatchObject({ bucket: "MENDEKATI", remainingDays: 1 })
  })

  it("jendela tidak sah ditolak", () => {
    expect(() => buildLeadExpectedCloseQueue([], NOW, -1)).toThrow(/Jendela/)
    expect(() => buildLeadExpectedCloseQueue([], NOW, 1.5)).toThrow(/Jendela/)
  })
})

describe("getLeadExpectedCloseQueue (loader)", () => {
  beforeEach(() => {
    mocks.prismaMock.lead.findMany.mockReset()
    mocks.prismaMock.user.findMany.mockReset()
    mocks.prismaMock.user.findMany.mockResolvedValue([{ id: 7, name: "Sari" }])
  })

  it("AC-EC-B6: satu query massal lead + satu user, nol mutasi, Decimal dipetakan", async () => {
    mocks.prismaMock.lead.findMany.mockResolvedValue([
      {
        id: 1, slug: "a", leadNumber: "LD-0001", name: "Budi", status: "new",
        expectedCloseDate: new Date(2026, 9, 25), estimatedValue: 100,
        assignedTo: 7, deletedAt: null,
      },
      {
        id: 2, slug: "b", leadNumber: "LD-0002", name: "Ani", status: "won",
        expectedCloseDate: new Date(2026, 9, 25), estimatedValue: null,
        assignedTo: null, deletedAt: null,
      },
    ])
    const r = await getLeadExpectedCloseQueue(NOW)
    expect(mocks.prismaMock.lead.findMany).toHaveBeenCalledTimes(1)
    expect(mocks.prismaMock.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deletedAt: null } }),
    )
    expect(mocks.prismaMock.user.findMany).toHaveBeenCalledTimes(1)
    expect(r.rows.map((x) => x.leadId)).toEqual([1])
    expect(r.rows[0]).toMatchObject({ estimatedValue: 100, assignedToName: "Sari", overdueDays: 1 })
    expect(Object.keys(mocks.prismaMock.lead)).toEqual(["findMany"])
  })
})
