import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Daftar kerja prioritas lead F-2026-10-25-031-S tahap 1 lapis aman.
 * Yang dijaga: won/lost/terkonversi/terhapus keluar populasi
 * (AC-LSC-B1 lapis baca); tanpa ketetapan = ember "Belum ditetapkan"
 * tanpa tingkat/skor karangan (AC-LSC-B3, BR-LSC-03); keluaran nol
 * skor/bobot/probabilitas (AC-LSC-B6, BR-LSC-06); urutan BR-LSC-08
 * deterministik; estimatedValue kosong di luar Σ (BR-LSC-10); loader
 * 1 query massal nol mutasi. Tingkat manual + aksi ubah menunggu
 * putusan Lead Q-LSC-2/Q-LSC-3 — tidak diuji karena tidak dibangun.
 */

const mocks = vi.hoisted(() => ({
  prismaMock: {
    lead: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
  },
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))

import {
  buildLeadPriorityQueue,
  LEAD_PRIORITY_BASIS_LABEL,
  LEAD_PRIORITY_BUCKET_LABELS,
  type LeadPriorityInput,
} from "../lead-priority"
import { getLeadPriorityQueue } from "../lead-priority-data"

function input(over: Partial<LeadPriorityInput>): LeadPriorityInput {
  return {
    id: 1,
    slug: "lead-1",
    leadNumber: "LD-0001",
    name: "Budi",
    status: "new",
    source: "website",
    expectedCloseDate: new Date(2026, 9, 30),
    estimatedValue: 100,
    assignedTo: 7,
    assignedToName: "Sari",
    convertedAt: null,
    deletedAt: null,
    ...over,
  }
}

describe("buildLeadPriorityQueue", () => {
  it("AC-LSC-B1 lapis baca: won/lost/terkonversi/terhapus TIDAK muncul", () => {
    const r = buildLeadPriorityQueue([
      input({ id: 1, status: "won" }),
      input({ id: 2, status: "lost" }),
      input({ id: 3, convertedAt: new Date(2026, 9, 20) }),
      input({ id: 4, deletedAt: new Date(2026, 9, 21) }),
      input({ id: 5, status: "qualified" }),
    ])
    expect(r.rows.map((x) => x.leadId)).toEqual([5])
    expect(r.totalActive).toBe(1)
  })

  it("AC-LSC-B3/BR-LSC-03: semua baris ember Belum ditetapkan, tanpa tingkat karangan", () => {
    const r = buildLeadPriorityQueue([input({ id: 1 }), input({ id: 2, status: "negotiation" })])
    expect(r.buckets).toHaveLength(1)
    expect(r.buckets[0]).toMatchObject({ bucket: "BELUM_DITETAPKAN", count: 2 })
    expect(LEAD_PRIORITY_BUCKET_LABELS.BELUM_DITETAPKAN).toBe("Belum ditetapkan")
    expect(r.rows.every((x) => x.bucketLabel === "Belum ditetapkan")).toBe(true)
    expect(r.basisLabel).toBe(LEAD_PRIORITY_BASIS_LABEL)
  })

  it("AC-LSC-B6/BR-LSC-06: nol skor/bobot/probabilitas/prediksi di field mana pun", () => {
    const r = buildLeadPriorityQueue([input({})])
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
    expect(
      keys.some((k) => /score|skor|probab|percent|persen|peluang|prediksi|forecast|weight|bobot|tingkat|level|grade/i.test(k)),
    ).toBe(false)
    expect(r.valueNotice).toContain("bukan piutang atau pendapatan")
  })

  it("AC-LSC-B4/BR-LSC-08: seri expectedCloseDate asc, kosong terakhir; lalu leadNumber, lalu id", () => {
    const r = buildLeadPriorityQueue([
      input({ id: 5, leadNumber: "LD-0005", expectedCloseDate: null }),
      input({ id: 2, leadNumber: "LD-0002", expectedCloseDate: new Date(2026, 10, 5) }),
      input({ id: 4, leadNumber: "LD-0004", expectedCloseDate: new Date(2026, 9, 28) }),
      input({ id: 3, leadNumber: "LD-0003", expectedCloseDate: new Date(2026, 9, 28) }),
      input({ id: 1, leadNumber: "LD-0001", expectedCloseDate: new Date(2026, 9, 28) }),
    ])
    expect(r.rows.map((x) => x.leadId)).toEqual([1, 3, 4, 2, 5])
    const forward = r.rows.map((x) => x.leadId)
    const shuffled = buildLeadPriorityQueue([
      input({ id: 4, leadNumber: "LD-0004", expectedCloseDate: new Date(2026, 9, 28) }),
      input({ id: 5, leadNumber: "LD-0005", expectedCloseDate: null }),
      input({ id: 1, leadNumber: "LD-0001", expectedCloseDate: new Date(2026, 9, 28) }),
      input({ id: 2, leadNumber: "LD-0002", expectedCloseDate: new Date(2026, 10, 5) }),
      input({ id: 3, leadNumber: "LD-0003", expectedCloseDate: new Date(2026, 9, 28) }),
    ])
    expect(shuffled.rows.map((x) => x.leadId)).toEqual(forward)
  })

  it("BR-LSC-10/E-LSC-7: estimatedValue kosong di luar Σ, tertanda, bukan Rp0", () => {
    const r = buildLeadPriorityQueue([
      input({ id: 1, estimatedValue: 250.5 }),
      input({ id: 2, estimatedValue: null }),
    ])
    expect(r.buckets[0].totalEstimatedValue).toBe(250.5)
    expect(r.buckets[0].noValueCount).toBe(1)
    expect(r.rows.find((x) => x.leadId === 2)).toMatchObject({
      hasEstimatedValue: false,
      estimatedValue: null,
      noValueLabel: "Prospek tanpa nilai estimasi",
    })
  })

  it("status liar tertanda; sumber kosong label funnel; tanpa penanggung label funnel", () => {
    const r = buildLeadPriorityQueue([
      input({ id: 1, status: "aneh", source: null, assignedTo: null, assignedToName: null }),
    ])
    expect(r.rows[0]).toMatchObject({
      stageLabel: "Status tidak dikenal",
      isUnknownStatus: true,
      sourceLabel: "Sumber tidak tercatat",
      assigneeLabel: "Belum ditugaskan",
    })
  })

  it("sumber tampil apa adanya tanpa bobot (BR-LSC-11)", () => {
    const r = buildLeadPriorityQueue([
      input({ id: 1, source: "referral" }),
      input({ id: 2, source: "sumber-liar" }),
    ])
    expect(r.rows.map((x) => x.sourceLabel)).toEqual(["referral", "sumber-liar"])
  })
})

describe("getLeadPriorityQueue (loader)", () => {
  beforeEach(() => {
    mocks.prismaMock.lead.findMany.mockReset()
    mocks.prismaMock.user.findMany.mockReset()
  })

  it("AC-LSC-B6 loader: satu query massal lead + satu user, nol mutasi, Decimal dipetakan", async () => {
    mocks.prismaMock.user.findMany.mockResolvedValue([{ id: 9, name: "Rina" }])
    const aktif = {
      id: 11, slug: "prio-a", leadNumber: "LD-0011", name: "Citra", status: "qualified",
      source: "pameran", expectedCloseDate: new Date(2026, 10, 2), estimatedValue: 750,
      assignedTo: 9, convertedAt: null, deletedAt: null,
    }
    const tutup = {
      ...aktif, id: 12, slug: "prio-b", leadNumber: "LD-0012", name: "Dedi", status: "lost",
      source: null, expectedCloseDate: null, estimatedValue: null,
      assignedTo: null, convertedAt: new Date(2026, 9, 18),
    }
    mocks.prismaMock.lead.findMany.mockResolvedValue([aktif, tutup])
    const r = await getLeadPriorityQueue()
    expect(mocks.prismaMock.lead.findMany).toHaveBeenCalledTimes(1)
    expect(mocks.prismaMock.lead.findMany.mock.calls[0][0].where).toEqual({ deletedAt: null })
    expect(mocks.prismaMock.user.findMany).toHaveBeenCalledTimes(1)
    expect(r.rows.map((x) => x.leadId)).toEqual([11])
    expect(r.rows[0]).toMatchObject({ estimatedValue: 750, assignedToName: "Rina", bucketLabel: "Belum ditetapkan" })
    expect(Object.keys(mocks.prismaMock.lead)).toEqual(["findMany"])
  })

  it("loader tanpa penanggung: query user dilewati, label funnel tampil", async () => {
    mocks.prismaMock.lead.findMany.mockResolvedValue([
      {
        id: 21, slug: "prio-c", leadNumber: "LD-0021", name: "Eka", status: "new",
        source: null, expectedCloseDate: null, estimatedValue: null,
        assignedTo: null, convertedAt: null, deletedAt: null,
      },
    ])
    const r = await getLeadPriorityQueue()
    expect(mocks.prismaMock.user.findMany).not.toHaveBeenCalled()
    expect(r.rows[0]).toMatchObject({ assignedToName: null, assigneeLabel: "Belum ditugaskan" })
  })
})
