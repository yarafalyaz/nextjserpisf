import { describe, it, expect, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  prismaMock: {
    productionOrder: { findMany: vi.fn().mockResolvedValue([]) },
  },
}))
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))

import {
  buildWipAgingTable,
  loadWipAgingReport,
  type WipAgingLoadResult,
} from "@/lib/reports/wip-aging-export"
import type { TableDocument } from "@/lib/pdf/engine/types"

describe("buildWipAgingTable (F-2026-10-20-72)", () => {
  it("tabel PDF memuat ember umur, baris order berjalan, tautan dokumen dilepas", () => {
    const table = buildWipAgingTable(loadWipAgingFixture())
    const text = JSON.stringify(table)
    expect(text).toContain("Umur WIP")
    expect(text).toContain("0-30 hari")
    expect(text).toContain("31-60 hari")
    expect(text).toContain(">90 hari")
    expect(text).toContain("PO-0001")
    expect(text).toContain("WO-0001")
    expect(text).not.toContain("productionOrder")
    expect(table.columns).toHaveLength(8)
  })

  it("keadaan kosong tampil catatan jujur, bukan tabel angka nol", () => {
    const table = buildWipAgingTable(emptyFixture())
    const text = JSON.stringify(table)
    expect(text).toContain("Belum ada order produksi berjalan")
    expect(table.rows.some((row) => row.kind === "data")).toBe(false)
  })

  it("loader snapshot: asOf dari periode, caption per tanggal akhir periode", async () => {
    const result = await loadWipAgingReport({
      start: new Date("2026-10-01T00:00:00Z"),
      end: new Date("2026-10-20T00:00:00Z"),
    })
    expect(result.asOf.toISOString()).toBe("2026-10-20T00:00:00.000Z")
    expect(result.periodCaption).toContain("20 Oktober 2026")
    expect(result.report.totalOrders).toBe(0)
  })
})

type Fixture = WipAgingLoadResult

function loadWipAgingFixture(): Fixture {
  return {
    report: {
      totalOrders: 1,
      totalWipAmount: 600_000,
      largestOrderId: 1,
      orders: [
        {
          id: 1,
          slug: "po-0001",
          documentNo: "PO-0001",
          status: "in_progress",
          productName: "Bumper Depan",
          workOrderDocumentNo: "WO-0001",
          ageStart: new Date("2026-09-10T00:00:00Z"),
          ageDays: 40,
          bucket: "d31_60",
          qty: 10,
          completedQty: 4,
          completionPercent: 40,
          totalActualCost: 1_000_000,
          releasedCost: 400_000,
          wipAmount: 600_000,
        },
      ],
      buckets: [
        { id: "d0_30", label: "0-30 hari", orderCount: 0, wipAmount: 0 },
        { id: "d31_60", label: "31-60 hari", orderCount: 1, wipAmount: 600_000 },
        { id: "d61_90", label: "61-90 hari", orderCount: 0, wipAmount: 0 },
        { id: "over90", label: ">90 hari", orderCount: 0, wipAmount: 0 },
      ],
    },
    periodCaption: "Per 20 Oktober 2026",
    asOf: new Date("2026-10-20T00:00:00Z"),
  } satisfies Fixture
}

function emptyFixture(): Fixture {
  return {
    report: {
      totalOrders: 0,
      totalWipAmount: 0,
      largestOrderId: null,
      orders: [],
      buckets: [
        { id: "d0_30", label: "0-30 hari", orderCount: 0, wipAmount: 0 },
        { id: "d31_60", label: "31-60 hari", orderCount: 0, wipAmount: 0 },
        { id: "d61_90", label: "61-90 hari", orderCount: 0, wipAmount: 0 },
        { id: "over90", label: ">90 hari", orderCount: 0, wipAmount: 0 },
      ],
    },
    periodCaption: "Per 20 Oktober 2026",
    asOf: new Date("2026-10-20T00:00:00Z"),
  } satisfies Fixture
}

const _unused: TableDocument["table"] | null = null
void _unused
