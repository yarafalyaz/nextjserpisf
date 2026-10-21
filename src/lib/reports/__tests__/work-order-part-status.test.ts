import { describe, it, expect, vi } from "vitest"

/**
 * Status turunan part per baris WO (F-2026-10-20-105 lapis aman).
 * Yang dijaga: precedence diganti > terpasang(-sebagian) > datang >
 * dipesan > menunggu; baris jasa (itemId<=0) tak-tertaut tanpa tebak;
 * issue legacy tanpa workOrderItemId diatribusikan per itemId ke baris
 * pertama yang cocok; loader hanya membaca MI completed + PO
 * non-cancelled tertaut WO.
 */

const mocks = vi.hoisted(() => ({
  prismaMock: {
    workOrder: { findUnique: vi.fn() },
    materialIssue: { findMany: vi.fn() },
    purchaseOrder: { findMany: vi.fn() },
  },
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))

import { getWorkOrderPartStatus } from "../work-order-part-status-data"
import {
  buildWorkOrderPartStatus,
  WORK_ORDER_PART_STATUS_NOTICE,
  type WorkOrderPartLineInput,
} from "../work-order-part-status"

function line(over: Partial<WorkOrderPartLineInput>): WorkOrderPartLineInput {
  return { id: 1, itemId: 10, description: "Shock", qty: 2, storedStatus: "pending", ...over }
}

describe("buildWorkOrderPartStatus", () => {
  it("precedence status per baris dari bukti dokumen", () => {
    const r = buildWorkOrderPartStatus({
      lines: [
        line({ id: 1, itemId: 10, storedStatus: "replaced" }),
        line({ id: 2, itemId: 11, qty: 2 }),
        line({ id: 3, itemId: 12, qty: 4 }),
        line({ id: 4, itemId: 13, qty: 1 }),
        line({ id: 5, itemId: 14, qty: 1 }),
        line({ id: 6, itemId: 15, qty: 1 }),
        line({ id: 7, itemId: 0, qty: 1 }),
      ],
      issues: [
        { workOrderItemId: 2, itemId: 11, qty: 2 },
        { workOrderItemId: 3, itemId: 12, qty: 1.5 },
      ],
      orders: [
        { itemId: 13, orderedQty: 1, receivedQty: 1 },
        { itemId: 14, orderedQty: 3, receivedQty: 1 },
      ],
    })
    expect(r.rows.map((row) => row.status)).toEqual([
      "diganti",
      "terpasang",
      "terpasang-sebagian",
      "datang",
      "dipesan",
      "menunggu",
      "tak-tertaut",
    ])
    expect(r.counts).toEqual({
      menunggu: 1,
      dipesan: 1,
      datang: 1,
      "terpasang-sebagian": 1,
      terpasang: 1,
      diganti: 1,
      "tak-tertaut": 1,
    })
    expect(r.notice).toBe(WORK_ORDER_PART_STATUS_NOTICE)
  })

  it("issue legacy tanpa tautan baris diatribusikan per item ke baris pertama", () => {
    const r = buildWorkOrderPartStatus({
      lines: [line({ id: 1, itemId: 10, qty: 2 }), line({ id: 2, itemId: 10, qty: 2 })],
      issues: [{ workOrderItemId: null, itemId: 10, qty: 3 }],
      orders: [],
    })
    expect(r.rows[0]).toMatchObject({ issuedQty: 2, status: "terpasang" })
    expect(r.rows[1]).toMatchObject({ issuedQty: 1, status: "terpasang-sebagian" })
  })

  it("baris replaced tetap diganti walau sudah ter-issue penuh", () => {
    const r = buildWorkOrderPartStatus({
      lines: [line({ id: 1, itemId: 10, qty: 1, storedStatus: "replaced" })],
      issues: [{ workOrderItemId: 1, itemId: 10, qty: 1 }],
      orders: [],
    })
    expect(r.rows[0].status).toBe("diganti")
  })
})

describe("getWorkOrderPartStatus", () => {
  it("loader membaca MI completed dan PO non-cancelled tertaut WO", async () => {
    mocks.prismaMock.workOrder.findUnique.mockResolvedValue({
      id: 5,
      items: [{ id: 1, itemId: 10, description: "Shock", qty: 2, status: "pending" }],
    })
    mocks.prismaMock.materialIssue.findMany.mockResolvedValue([
      { items: [{ workOrderItemId: 1, itemId: 10, qty: 2 }] },
    ])
    mocks.prismaMock.purchaseOrder.findMany.mockResolvedValue([])
    const r = await getWorkOrderPartStatus(5)
    expect(r?.rows[0].status).toBe("terpasang")
    expect(mocks.prismaMock.materialIssue.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workOrderId: 5, status: "completed" } }),
    )
    expect(mocks.prismaMock.purchaseOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workOrderId: 5, deletedAt: null, status: { notIn: ["cancelled"] } },
      }),
    )
  })

  it("WO tidak ada -> null", async () => {
    mocks.prismaMock.workOrder.findUnique.mockResolvedValue(null)
    await expect(getWorkOrderPartStatus(99)).resolves.toBeNull()
  })
})
