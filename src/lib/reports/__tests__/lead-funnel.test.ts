import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Corong prospek F-2026-10-22-092-S (putusan Q-LF-1..5 BOT 1).
 * Yang dijaga per aturan spec §2:
 * - BR-LF-01 kosakata persis LEAD_STATUSES; status asing → status_tidak_dikenal.
 * - BR-LF-02 populasi deletedAt null saja (builder menyaring sendiri).
 * - BR-LF-03 konversi hanya dari convertedAt/customerId; won manual →
 *   menang_belum_terkonversi, bukan terkonversi.
 * - BR-LF-04 tanpa histori tahap → tanpa_histori_tahap, keluar penyebut rasio.
 * - BR-LF-05 penyebut 0 → rasio null, bukan 0.
 * - BR-LF-06 lompat tahap mencapai tujuan + terlewati_tidak_tercatat.
 * - BR-LF-07 mundur tidak menghapus tahap tertinggi pernah dicapai.
 * - BR-LF-08 estimatedValue kosong = ember tanpa nilai terpisah, bukan Rp0.
 * - BR-LF-09 sumber teks apa adanya; kosong → sumber_tidak_tercatat;
 *   penanggung kosong → belum_ditugaskan; scope tanpa izin nama → null.
 * - Q-LF-3: kohort dari aktivitas dalam periode; pencapaian dari seluruh
 *   histori s.d. akhir periode.
 */

const mocks = vi.hoisted(() => ({
  prismaMock: {
    lead: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
  },
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))

import {
  buildLeadFunnel,
  LEAD_FUNNEL_MOVEMENT_NOTICE_TEXT,
  LEAD_FUNNEL_STAGE_LABELS,
  LEAD_FUNNEL_VALUE_NOTICE_TEXT,
  type LeadFunnelLeadInput,
} from "../lead-funnel"
import { getLeadFunnel } from "../lead-funnel-data"

const PERIOD = { start: new Date(2026, 9, 1), end: new Date(2026, 9, 31, 23, 59, 59) }

function act(newStatus: string | null, createdAt: Date, type = "status_change") {
  return { type, oldStatus: null, newStatus, createdAt }
}

function lead(over: Partial<LeadFunnelLeadInput>): LeadFunnelLeadInput {
  return {
    id: 1,
    status: "new",
    estimatedValue: null,
    source: null,
    assignedTo: null,
    assignedToName: null,
    customerId: null,
    convertedAt: null,
    deletedAt: null,
    activities: [],
    ...over,
  }
}

describe("buildLeadFunnel posisi saat ini", () => {
  it("BR-LF-01/02: per status kanonik; status asing ember terpisah; deleted disaring builder", () => {
    const r = buildLeadFunnel(
      [
        lead({ id: 1, status: "new" }),
        lead({ id: 2, status: "won", convertedAt: new Date(2026, 9, 5), customerId: 9 }),
        lead({ id: 3, status: "arsip-lama" }),
        lead({ id: 4, status: "lost", deletedAt: new Date(2026, 9, 2) }),
      ],
      { includeAssigneeBreakdown: true, period: null },
    )
    expect(r.position.totalLeads).toBe(3)
    expect(r.position.stages.map((s) => s.status)).toEqual([
      "new",
      "contacted",
      "qualified",
      "proposal",
      "negotiation",
      "won",
      "lost",
    ])
    expect(r.position.stages.find((s) => s.status === "lost")?.count).toBe(0)
    expect(r.position.unknownStatus).toMatchObject({ status: "status_tidak_dikenal", count: 1 })
    expect(
      r.position.stages.reduce((sum, s) => sum + s.count, 0) + r.position.unknownStatus.count,
    ).toBe(r.position.totalLeads)
    expect(LEAD_FUNNEL_STAGE_LABELS.negotiation).toBe("Negosiasi")
  })

  it("BR-LF-03: won manual tanpa konversi bukan terkonversi; won terkonversi tetap di ember won", () => {
    const r = buildLeadFunnel(
      [
        lead({ id: 1, status: "won" }),
        lead({ id: 2, status: "won", convertedAt: new Date(2026, 9, 5) }),
        lead({ id: 3, status: "won", customerId: 7 }),
      ],
      { includeAssigneeBreakdown: false, period: null },
    )
    expect(r.position.stages.find((s) => s.status === "won")?.count).toBe(3)
    expect(r.position.wonNotConverted).toMatchObject({
      status: "menang_belum_terkonversi",
      count: 1,
    })
    expect(r.position.convertedCount).toBe(2)
  })

  it("BR-LF-08: estimatedValue kosong ember terpisah; Rp0 asli menyatu ke total", () => {
    const r = buildLeadFunnel(
      [
        lead({ id: 1, status: "new", estimatedValue: null }),
        lead({ id: 2, status: "new", estimatedValue: 0 }),
        lead({ id: 3, status: "new", estimatedValue: 1500.5 }),
      ],
      { includeAssigneeBreakdown: false, period: null },
    )
    const bucket = r.position.stages.find((s) => s.status === "new")!
    expect(bucket.count).toBe(3)
    expect(bucket.estimatedValueTotal).toBe(1500.5)
    expect(bucket.withoutValueCount).toBe(1)
  })

  it("BR-LF-09: sumber apa adanya + ember kosong; penanggung kosong; scope leads_page menyembunyikan nama", () => {
    const inputs = [
      lead({ id: 1, source: "Pameran Otomotif", assignedTo: 5, assignedToName: "Sari" }),
      lead({ id: 2, source: "  ", assignedTo: null }),
      lead({ id: 3, source: null, assignedTo: 5, assignedToName: "Sari" }),
    ]
    const report = buildLeadFunnel(inputs, { includeAssigneeBreakdown: true, period: null })
    expect(report.position.bySource.map((row) => row.key)).toEqual([
      "sumber_tidak_tercatat",
      "Pameran Otomotif",
    ])
    expect(report.position.bySource[0].count).toBe(2)
    expect(report.position.byAssignee).toEqual([
      expect.objectContaining({ key: "user:5", label: "Sari", count: 2 }),
      expect.objectContaining({ key: "belum_ditugaskan", label: "Belum ditugaskan", count: 1 }),
    ])

    const leadsPage = buildLeadFunnel(inputs, { includeAssigneeBreakdown: false, period: null })
    expect(leadsPage.position.byAssignee).toBeNull()
    expect(leadsPage.position.bySource).toHaveLength(2)
  })

  it("BR-LF-04 posisi: tanpa aktivitas gerakan dihitung noStageHistoryCount", () => {
    const r = buildLeadFunnel(
      [
        lead({ id: 1, activities: [] }),
        lead({ id: 2, activities: [{ type: "note", oldStatus: null, newStatus: null, createdAt: new Date(2026, 9, 3) }] }),
        lead({ id: 3, activities: [act("contacted", new Date(2026, 9, 3))] }),
      ],
      { includeAssigneeBreakdown: false, period: null },
    )
    expect(r.position.noStageHistoryCount).toBe(2)
  })
})

describe("buildLeadFunnel corong gerakan periode", () => {
  it("Q-LF-3: kohort dari aktivitas dalam periode; pencapaian histori penuh s.d. akhir periode", () => {
    const r = buildLeadFunnel(
      [
        // Mencapai negotiation SEBELUM periode, won DI dalam periode → capai semua tahap.
        lead({
          id: 1,
          status: "won",
          convertedAt: new Date(2026, 9, 10),
          customerId: 3,
          activities: [
            act("contacted", new Date(2026, 8, 2)),
            act("qualified", new Date(2026, 8, 3)),
            act("proposal", new Date(2026, 8, 4)),
            act("negotiation", new Date(2026, 8, 5)),
            act(null, new Date(2026, 9, 10), "conversion"),
          ],
        }),
        // Aktivitas hanya sebelum periode → bukan kohort.
        lead({ id: 2, status: "contacted", activities: [act("contacted", new Date(2026, 8, 20))] }),
        // Dibuat dalam periode tanpa aktivitas → bukan kohort (posisi saja).
        lead({ id: 3, status: "new", activities: [] }),
      ],
      { includeAssigneeBreakdown: true, period: PERIOD },
    )
    expect(r.movement).not.toBeNull()
    expect(r.movement!.cohortCount).toBe(1)
    expect(r.movement!.stages.map((s) => s.reachedCount)).toEqual([1, 1, 1, 1, 1, 1])
    // `new` tidak pernah tercatat sebagai newStatus (createLead tanpa
    // status_change) → terlewati_tidak_tercatat di tahap new saja.
    expect(r.movement!.stages.map((s) => s.skippedUnrecordedCount)).toEqual([1, 0, 0, 0, 0, 0])
    expect(r.movement!.convertedCount).toBe(1)
    expect(r.movement!.wonNotConvertedCount).toBe(0)
    // Aktivitas sesudah akhir periode tidak menaikkan pencapaian.
    const after = buildLeadFunnel(
      [
        lead({
          id: 1,
          status: "qualified",
          activities: [act("contacted", new Date(2026, 9, 5)), act("qualified", new Date(2026, 10, 2))],
        }),
      ],
      { includeAssigneeBreakdown: false, period: PERIOD },
    )
    expect(after.movement!.stages.map((s) => s.reachedCount)).toEqual([1, 1, 0, 0, 0, 0])
  })

  it("BR-LF-06: lompat tahap mencapai tujuan; tahap antara terlewati_tidak_tercatat", () => {
    const r = buildLeadFunnel(
      [lead({ id: 1, status: "qualified", activities: [act("qualified", new Date(2026, 9, 5))] })],
      { includeAssigneeBreakdown: false, period: PERIOD },
    )
    expect(r.movement!.stages.map((s) => [s.reachedCount, s.skippedUnrecordedCount])).toEqual([
      [1, 1], // new terlewati
      [1, 1], // contacted terlewati
      [1, 0], // qualified eksplisit
      [0, 0],
      [0, 0],
      [0, 0],
    ])
  })

  it("BR-LF-07: mundur tahap tidak menghapus pencapaian tertinggi", () => {
    const r = buildLeadFunnel(
      [
        lead({
          id: 1,
          status: "contacted",
          activities: [
            act("contacted", new Date(2026, 9, 2)),
            act("proposal", new Date(2026, 9, 3)),
            act("contacted", new Date(2026, 9, 4)),
          ],
        }),
      ],
      { includeAssigneeBreakdown: false, period: PERIOD },
    )
    expect(r.movement!.stages.map((s) => s.reachedCount)).toEqual([1, 1, 1, 1, 0, 0])
    expect(r.movement!.stages[2].skippedUnrecordedCount).toBe(1) // qualified terlewati
  })

  it("BR-LF-04/05: tanpa histori terbaca keluar penyebut; penyebut 0 → rasio null", () => {
    const r = buildLeadFunnel(
      [
        // Aktivitas dalam periode tapi newStatus asing saja.
        lead({ id: 1, status: "arsip-lama", activities: [act("arsip-lama", new Date(2026, 9, 5))] }),
        lead({ id: 2, status: "contacted", activities: [act("contacted", new Date(2026, 9, 6))] }),
      ],
      { includeAssigneeBreakdown: false, period: PERIOD },
    )
    expect(r.movement!.cohortCount).toBe(2)
    expect(r.movement!.noStageHistoryCount).toBe(1)
    expect(r.movement!.unknownStatusCount).toBe(1)
    expect(r.movement!.stages[0].reachedCount).toBe(1)
    expect(r.movement!.stages[0].transitionRatioFromPrevious).toBeNull()
    expect(r.movement!.stages[1].transitionRatioFromPrevious).toBe(1)
    expect(r.movement!.stages[2].transitionRatioFromPrevious).toBe(0)

    const empty = buildLeadFunnel([], { includeAssigneeBreakdown: false, period: PERIOD })
    expect(empty.movement!.cohortCount).toBe(0)
    expect(empty.movement!.stages.every((s) => s.transitionRatioFromPrevious === null)).toBe(true)
  })

  it("BR-LF-03 gerakan: won manual di kohort → wonNotConvertedCount; lost tercatat terpisah", () => {
    const r = buildLeadFunnel(
      [
        lead({ id: 1, status: "won", activities: [act("won", new Date(2026, 9, 5))] }),
        lead({
          id: 2,
          status: "lost",
          activities: [act("qualified", new Date(2026, 9, 5)), act("lost", new Date(2026, 9, 6))],
        }),
      ],
      { includeAssigneeBreakdown: false, period: PERIOD },
    )
    expect(r.movement!.wonNotConvertedCount).toBe(1)
    expect(r.movement!.convertedCount).toBe(0)
    expect(r.movement!.lostReachedCount).toBe(1)
    expect(r.movement!.stages.map((s) => s.reachedCount)).toEqual([2, 2, 2, 1, 1, 1])
  })

  it("label jujur verbatim spec §6 tersedia untuk ditempel UI apa adanya", () => {
    expect(LEAD_FUNNEL_MOVEMENT_NOTICE_TEXT).toBe(
      "Corong gerakan membaca histori perubahan status. Prospek lama tanpa histori tampil di posisi saat ini saja.",
    )
    expect(LEAD_FUNNEL_VALUE_NOTICE_TEXT).toBe(
      "Nilai estimasi adalah perkiraan peluang, bukan piutang atau pendapatan.",
    )
  })
})

describe("getLeadFunnel loader", () => {
  beforeEach(() => {
    mocks.prismaMock.lead.findMany.mockReset()
    mocks.prismaMock.user.findMany.mockReset()
    mocks.prismaMock.user.findMany.mockResolvedValue([{ id: 5, name: "Sari" }])
  })

  function prismaLead(over: Record<string, unknown>) {
    return {
      id: 1,
      status: "new",
      estimatedValue: null,
      source: null,
      assignedTo: null,
      customerId: null,
      convertedAt: null,
      deletedAt: null,
      activities: [],
      ...over,
    }
  }

  it("satu query massal non-deleted + aktivitas gerakan; scope report memuat nama penanggung", async () => {
    mocks.prismaMock.lead.findMany.mockResolvedValue([
      prismaLead({ id: 1, assignedTo: 5, estimatedValue: 2500 }),
    ])
    const r = await getLeadFunnel("report", PERIOD)
    expect(mocks.prismaMock.lead.findMany).toHaveBeenCalledTimes(1)
    expect(mocks.prismaMock.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deletedAt: null } }),
    )
    expect(mocks.prismaMock.user.findMany).toHaveBeenCalledTimes(1)
    expect(r.position.byAssignee?.[0]).toMatchObject({ label: "Sari", count: 1 })
    expect(r.position.stages[0].estimatedValueTotal).toBe(2500)
    expect(r.movement).not.toBeNull()
  })

  it("scope leads_page: tanpa query user, byAssignee null (Q-LF-1 fail-closed nama)", async () => {
    mocks.prismaMock.lead.findMany.mockResolvedValue([prismaLead({ id: 1, assignedTo: 5 })])
    const r = await getLeadFunnel("leads_page")
    expect(mocks.prismaMock.user.findMany).not.toHaveBeenCalled()
    expect(r.position.byAssignee).toBeNull()
    expect(r.movement).toBeNull()
  })

  it("scope tidak dikenal ditolak fail-closed tanpa query", async () => {
    await expect(
      getLeadFunnel("semua" as never),
    ).rejects.toThrow("Scope corong prospek tidak dikenal; akses ditolak.")
    expect(mocks.prismaMock.lead.findMany).not.toHaveBeenCalled()
  })
})

describe("F-2026-10-25-030-S rincian alasan kalah (Q-LR-3)", () => {
  it("lostByReason: kategori dari aktivitas lost terakhir; lama tak-tercatat; jumlah = ember lost", () => {
    const at = new Date(2026, 9, 10)
    const r = buildLeadFunnel(
      [
        lead({
          id: 1, status: "lost",
          activities: [
            { type: "status_change", oldStatus: "proposal", newStatus: "lost", createdAt: at, description: "[kalah:harga] mahal" },
          ],
        }),
        lead({
          id: 2, status: "lost",
          activities: [
            { type: "status_change", oldStatus: "new", newStatus: "lost", createdAt: at, description: "teks bebas harga mahal" },
          ],
        }),
        lead({ id: 3, status: "lost", activities: [] }),
        lead({
          id: 4, status: "new",
          activities: [
            { type: "status_change", oldStatus: "proposal", newStatus: "lost", createdAt: at, description: "[kalah:budget]" },
          ],
        }),
      ],
      { includeAssigneeBreakdown: false, period: null },
    )
    expect(r.position.stages.find((s) => s.status === "lost")?.count).toBe(3)
    expect(r.position.lostByReason.reduce((sum, row) => sum + row.count, 0)).toBe(3)
    expect(r.position.lostByReason.find((row) => row.key === "harga")?.count).toBe(1)
    expect(r.position.lostByReason.find((row) => row.key === "budget")?.count).toBe(0)
    expect(r.position.lostByReason.find((row) => row.key === "tak-tercatat")?.count).toBe(2)
  })
})
