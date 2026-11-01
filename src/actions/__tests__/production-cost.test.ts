import { describe, it, expect, vi, beforeEach } from "vitest"

// Regression tests for non-material production cost actions (PRD FAB-06/07/08/09):
//  1. createProductionCost rolls the amount into the production order HPP, but
//     only for production orders (not work orders), and refuses a completed order.
//  2. updateProductionCost applies only the delta.
//  3. deleteProductionCost subtracts the amount.
//  4. pullLaborCostFromTimesheets snapshots hours×rate, skips already-pulled
//     timesheets, and needs a linked project.

const requirePermissionMock = vi.fn()
const periodOpenMock = vi.fn()
const revalidateMock = vi.fn()
const logActivityMock = vi.fn()
const applyDeltaMock = vi.fn()

const costCreateMock = vi.fn()
const costFindUniqueMock = vi.fn()
const costUpdateMock = vi.fn()
const costDeleteMock = vi.fn()
const costFindManyMock = vi.fn()
const orderFindUniqueMock = vi.fn()
const woFindUniqueMock = vi.fn()
const vendorFindUniqueMock = vi.fn()
const timesheetFindManyMock = vi.fn()
const queryRawMock = vi.fn()
const jobGuardMock = vi.fn()

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => requirePermissionMock(...a),
}))
vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: (...a: unknown[]) => logActivityMock(...a),
}))
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidateMock(...a) }))
vi.mock("@/lib/services/production-cost.service", () => ({
  applyProductionCostDelta: (...a: unknown[]) => applyDeltaMock(...a),
}))
vi.mock("@/lib/services/period-lock.service", () => ({
  assertPeriodOpen: (...a: unknown[]) => periodOpenMock(...a),
}))
vi.mock("@/lib/services/job-closeout.service", () => ({
  assertJobCostMutable: (...a: unknown[]) => jobGuardMock(...a),
}))

vi.mock("@/lib/db/prisma", () => {
  const prisma: Record<string, unknown> = {
    productionCost: {
      create: (...a: unknown[]) => costCreateMock(...a),
      findUnique: (...a: unknown[]) => costFindUniqueMock(...a),
      update: (...a: unknown[]) => costUpdateMock(...a),
      delete: (...a: unknown[]) => costDeleteMock(...a),
      findMany: (...a: unknown[]) => costFindManyMock(...a),
    },
    productionOrder: { findUnique: (...a: unknown[]) => orderFindUniqueMock(...a) },
    workOrder: { findUnique: (...a: unknown[]) => woFindUniqueMock(...a) },
    vendor: { findUnique: (...a: unknown[]) => vendorFindUniqueMock(...a) },
    timesheet: { findMany: (...a: unknown[]) => timesheetFindManyMock(...a) },
    $queryRaw: (...a: unknown[]) => queryRawMock(...a),
  }
  prisma.$transaction = vi.fn((cb: unknown) =>
    typeof cb === "function" ? (cb as (tx: unknown) => unknown)(prisma) : Promise.all(cb as unknown[]),
  )
  return { prisma }
})

import {
  createProductionCost,
  updateProductionCost,
  deleteProductionCost,
  pullLaborCostFromTimesheets,
  pullLaborCostFromWorkOrderTimesheets,
  applyOverheadToProductionOrder,
} from "../production-cost.actions"

function fd(payload: Record<string, string | number | null | undefined>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(payload)) if (v != null) f.append(k, String(v))
  return f
}

beforeEach(() => {
  for (const m of [
    requirePermissionMock, periodOpenMock, revalidateMock, logActivityMock, applyDeltaMock,
    costCreateMock, costFindUniqueMock, costUpdateMock, costDeleteMock, costFindManyMock,
    orderFindUniqueMock, woFindUniqueMock, vendorFindUniqueMock, timesheetFindManyMock, queryRawMock,
  ]) m.mockReset()
  queryRawMock.mockResolvedValue([])

  requirePermissionMock.mockResolvedValue({ id: 5 })
  periodOpenMock.mockResolvedValue(undefined)
  jobGuardMock.mockReset()
  jobGuardMock.mockResolvedValue(undefined)
  applyDeltaMock.mockResolvedValue(undefined)
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("kunci periode hari-ini (F-2026-10-20-24a)", () => {
  const LOCKED = new Error("Periode akuntansi sudah ditutup sampai 31/10/2026.")

  it("create ditolak dan tidak menulis bila hari ini terkunci", async () => {
    periodOpenMock.mockRejectedValue(LOCKED)

    const res = await createProductionCost(fd({ productionOrderId: 1, category: "labor", amount: 1000 }))

    expect(res.success).toBe(false)
    expect(res.error).toContain("ditutup")
    expect(periodOpenMock).toHaveBeenCalledWith(expect.any(Date))
    expect(costCreateMock).not.toHaveBeenCalled()
    expect(applyDeltaMock).not.toHaveBeenCalled()
  })

  it("update ditolak dan tidak menulis bila hari ini terkunci", async () => {
    periodOpenMock.mockRejectedValue(LOCKED)

    const res = await updateProductionCost(5, fd({ category: "labor", amount: 300 }))

    expect(res.success).toBe(false)
    expect(res.error).toContain("ditutup")
    expect(costUpdateMock).not.toHaveBeenCalled()
    expect(applyDeltaMock).not.toHaveBeenCalled()
  })

  it("delete ditolak dan tidak menulis bila hari ini terkunci", async () => {
    periodOpenMock.mockRejectedValue(LOCKED)

    const res = await deleteProductionCost(5)

    expect(res.success).toBe(false)
    expect(res.error).toContain("ditutup")
    expect(costDeleteMock).not.toHaveBeenCalled()
    expect(applyDeltaMock).not.toHaveBeenCalled()
  })

  it("pullLabor ditolak bila hari ini terkunci", async () => {
    periodOpenMock.mockRejectedValue(LOCKED)

    const res = await pullLaborCostFromTimesheets(7, 1, 25000)

    expect(res.success).toBe(false)
    expect(res.error).toContain("ditutup")
    expect(timesheetFindManyMock).not.toHaveBeenCalled()
    expect(costCreateMock).not.toHaveBeenCalled()
  })

  it("applyOverhead ditolak bila hari ini terkunci", async () => {
    periodOpenMock.mockRejectedValue(LOCKED)

    const res = await applyOverheadToProductionOrder(
      fd({ productionOrderId: 1, driverType: "machine_hours", driverQty: 2, rate: 1000 }),
    )

    expect(res.success).toBe(false)
    expect(res.error).toContain("ditutup")
    expect(costCreateMock).not.toHaveBeenCalled()
    expect(applyDeltaMock).not.toHaveBeenCalled()
  })

  it("kunci kemarin tidak menghalangi: create hari ini tetap lewat", async () => {
    periodOpenMock.mockResolvedValue(undefined)
    orderFindUniqueMock.mockResolvedValue({ id: 1, status: "in_progress" })
    costCreateMock.mockResolvedValue({ id: 99 })

    const res = await createProductionCost(fd({ productionOrderId: 1, category: "labor", amount: 1000 }))

    expect(res.success).toBe(true)
    expect(periodOpenMock).toHaveBeenCalledTimes(2)
  })

  it("regression round 17: tutup periode sesudah assert luar tetap menolak create WO-only di dalam tx", async () => {
    woFindUniqueMock.mockResolvedValue({ id: 7 })
    // Panggilan luar (tanpa tx) lolos; panggilan dalam tx (argumen kedua
    // = client transaksi) menolak — mensimulasikan tutup periode yang
    // commit di antara keduanya.
    periodOpenMock.mockImplementation(async (_d: unknown, tx?: unknown) => {
      if (tx) throw LOCKED
    })
    const res = await createProductionCost(fd({ workOrderId: 7, category: "service", amount: 50000 }))
    expect(res.success).toBe(false)
    expect(res.error).toContain("ditutup")
    expect(costCreateMock).not.toHaveBeenCalled()
  })

  it("regression round 17: pull WO-only menilai ulang periode di dalam tx (tanpa backstop jurnal)", async () => {
    woFindUniqueMock.mockResolvedValue({ id: 7, status: "in_progress" })
    timesheetFindManyMock.mockResolvedValue([{ id: 1, hours: 2, date: new Date(), description: null }])
    periodOpenMock.mockImplementation(async (_d: unknown, tx?: unknown) => {
      if (tx) throw LOCKED
    })
    const res = await pullLaborCostFromWorkOrderTimesheets(7, 25000)
    expect(res.success).toBe(false)
    expect(res.error).toContain("ditutup")
    expect(costCreateMock).not.toHaveBeenCalled()
  })
})

describe("createProductionCost", () => {
  it("rolls the amount into the production order HPP", async () => {
    orderFindUniqueMock.mockResolvedValue({ id: 1, status: "in_progress" })
    costCreateMock.mockResolvedValue({ id: 99 })

    const res = await createProductionCost(
      fd({ productionOrderId: 1, category: "labor", amount: 250000, hours: 10, rate: 25000 }),
    )

    expect(res.success).toBe(true)
    expect(applyDeltaMock).toHaveBeenCalledWith(1, 250000, expect.anything(), expect.objectContaining({ costLineId: expect.anything() }))
    const arg = costCreateMock.mock.calls[0][0]
    expect(arg.data.category).toBe("labor")
    expect(Number(arg.data.amount)).toBe(250000)
  })

  it("does NOT roll a work-order-only cost into a production order HPP", async () => {
    woFindUniqueMock.mockResolvedValue({ id: 7 })
    costCreateMock.mockResolvedValue({ id: 100 })

    const res = await createProductionCost(fd({ workOrderId: 7, category: "service", amount: 50000 }))

    expect(res.success).toBe(true)
    expect(applyDeltaMock).not.toHaveBeenCalled()
  })

  it("refuses to add cost to a completed production order", async () => {
    orderFindUniqueMock.mockResolvedValue({ id: 1, status: "completed" })

    const res = await createProductionCost(fd({ productionOrderId: 1, category: "labor", amount: 1000 }))

    expect(res.success).toBe(false)
    expect(res.error).toContain("completed")
    expect(costCreateMock).not.toHaveBeenCalled()
  })

  it("refuses when neither order nor work order is given", async () => {
    const res = await createProductionCost(fd({ category: "labor", amount: 1000 }))

    expect(res.success).toBe(false)
    expect(res.error).toContain("perintah")
    expect(costCreateMock).not.toHaveBeenCalled()
  })
})

describe("updateProductionCost", () => {
  it("applies only the delta to the order", async () => {
    costFindUniqueMock.mockResolvedValue({ id: 5, productionOrderId: 1, amount: 100 })
    orderFindUniqueMock.mockResolvedValue({ id: 1, status: "in_progress" })
    costUpdateMock.mockResolvedValue({})

    const res = await updateProductionCost(5, fd({ category: "labor", amount: 300 }))

    expect(res.success).toBe(true)
    expect(applyDeltaMock).toHaveBeenCalledWith(1, 200, expect.anything(), expect.anything())
  })

  it("delta dihitung dari amount TERKUNCI di dalam tx, bukan snapshot luar", async () => {
    // Snapshot luar basi (100); baris sudah berubah jadi 250 oleh penulis
    // lain sebelum kunci didapat. Delta wajib 300 − 250 = 50, bukan 200.
    costFindUniqueMock
      .mockResolvedValueOnce({ id: 5, productionOrderId: 1, amount: 100 })
      .mockResolvedValue({ id: 5, productionOrderId: 1, amount: 250 })
    orderFindUniqueMock.mockResolvedValue({ id: 1, status: "in_progress" })
    costUpdateMock.mockResolvedValue({})

    const res = await updateProductionCost(5, fd({ category: "labor", amount: 300 }))

    expect(res.success).toBe(true)
    const sql = queryRawMock.mock.calls.flat().join(" ")
    expect(sql).toContain("production_costs")
    expect(applyDeltaMock).toHaveBeenCalledWith(1, 50, expect.anything(), expect.anything())
  })

  it("refuses to edit a cost on a completed/cancelled production order", async () => {
    costFindUniqueMock.mockResolvedValue({ id: 5, productionOrderId: 1, amount: 100 })
    orderFindUniqueMock.mockResolvedValue({ id: 1, status: "completed" })

    const res = await updateProductionCost(5, fd({ category: "labor", amount: 300 }))

    expect(res.success).toBe(false)
    expect(res.error).toContain("completed")
    expect(costUpdateMock).not.toHaveBeenCalled()
    expect(applyDeltaMock).not.toHaveBeenCalled()
  })

  it("refuses to edit a cost whose linked production order is missing", async () => {
    costFindUniqueMock.mockResolvedValue({ id: 5, productionOrderId: 9, amount: 100 })
    orderFindUniqueMock.mockResolvedValue(null)

    const res = await updateProductionCost(5, fd({ category: "labor", amount: 300 }))

    expect(res.success).toBe(false)
    expect(res.error).toContain("tidak ditemukan")
    expect(costUpdateMock).not.toHaveBeenCalled()
    expect(applyDeltaMock).not.toHaveBeenCalled()
  })
})

describe("deleteProductionCost", () => {
  it("subtracts the amount from the order", async () => {
    costFindUniqueMock.mockResolvedValue({ id: 5, productionOrderId: 1, amount: 400 })
    orderFindUniqueMock.mockResolvedValue({ id: 1, status: "in_progress" })
    costDeleteMock.mockResolvedValue({})

    const res = await deleteProductionCost(5)

    expect(res.success).toBe(true)
    expect(applyDeltaMock).toHaveBeenCalledWith(1, -400, expect.anything(), expect.anything())
  })

  it("pengurangan memakai amount TERKUNCI di dalam tx, bukan snapshot luar", async () => {
    costFindUniqueMock
      .mockResolvedValueOnce({ id: 5, productionOrderId: 1, amount: 400 })
      .mockResolvedValue({ id: 5, productionOrderId: 1, amount: 250 })
    orderFindUniqueMock.mockResolvedValue({ id: 1, status: "in_progress" })
    costDeleteMock.mockResolvedValue({})

    const res = await deleteProductionCost(5)

    expect(res.success).toBe(true)
    expect(applyDeltaMock).toHaveBeenCalledWith(1, -250, expect.anything(), expect.anything())
  })

  it("refuses to delete a cost on a completed production order", async () => {
    costFindUniqueMock.mockResolvedValue({ id: 5, productionOrderId: 1, amount: 400 })
    orderFindUniqueMock.mockResolvedValue({ id: 1, status: "completed" })

    const res = await deleteProductionCost(5)

    expect(res.success).toBe(false)
    expect(res.error).toContain("completed")
    expect(costDeleteMock).not.toHaveBeenCalled()
    expect(applyDeltaMock).not.toHaveBeenCalled()
  })
})

describe("F-2026-10-21-009-V: guard job closed (production-cost actions)", () => {
  const CLOSED = new Error("Biaya tidak dapat ditambahkan: perintah kerja sudah ditutup (closed).")

  it("create ke job closed ditolak guard, tanpa tulis", async () => {
    orderFindUniqueMock.mockResolvedValue({ id: 1, status: "in_progress" })
    jobGuardMock.mockRejectedValue(CLOSED)

    const res = await createProductionCost(fd({ productionOrderId: 1, category: "labor", amount: 1000 }))

    expect(res.success).toBe(false)
    expect(res.error).toContain("sudah ditutup")
    expect(costCreateMock).not.toHaveBeenCalled()
    expect(applyDeltaMock).not.toHaveBeenCalled()
  })

  it("create WO-only ke WO closed ditolak guard", async () => {
    woFindUniqueMock.mockResolvedValue({ id: 7 })
    jobGuardMock.mockRejectedValue(CLOSED)

    const res = await createProductionCost(fd({ workOrderId: 7, category: "service", amount: 500 }))

    expect(res.success).toBe(false)
    expect(costCreateMock).not.toHaveBeenCalled()
  })

  it("update biaya job closed ditolak guard", async () => {
    costFindUniqueMock.mockResolvedValue({ id: 5, productionOrderId: 1, workOrderId: null, amount: 100 })
    orderFindUniqueMock.mockResolvedValue({ id: 1, status: "in_progress" })
    jobGuardMock.mockRejectedValue(CLOSED)

    const res = await updateProductionCost(5, fd({ category: "labor", amount: 300 }))

    expect(res.success).toBe(false)
    expect(costUpdateMock).not.toHaveBeenCalled()
  })

  it("delete biaya job closed ditolak guard", async () => {
    costFindUniqueMock.mockResolvedValue({ id: 5, productionOrderId: 1, workOrderId: null, amount: 100 })
    orderFindUniqueMock.mockResolvedValue({ id: 1, status: "in_progress" })
    jobGuardMock.mockRejectedValue(CLOSED)

    const res = await deleteProductionCost(5)

    expect(res.success).toBe(false)
    expect(costDeleteMock).not.toHaveBeenCalled()
  })

  it("create PO closed ditolak mutableOrderError menyebut closed", async () => {
    orderFindUniqueMock.mockResolvedValue({ id: 1, status: "closed" })

    const res = await createProductionCost(fd({ productionOrderId: 1, category: "labor", amount: 1000 }))

    expect(res.success).toBe(false)
    expect(res.error).toContain("closed")
    expect(costCreateMock).not.toHaveBeenCalled()
  })
})

describe("STOK-14: biaya dibekukan sesudah release parsial", () => {
  const PARTIAL = { id: 1, status: "in_progress", completedQty: 5 }

  it("create ditolak bila sebagian qty sudah dirilis", async () => {
    orderFindUniqueMock.mockResolvedValue(PARTIAL)

    const res = await createProductionCost(fd({ productionOrderId: 1, category: "labor", amount: 200000 }))

    expect(res.success).toBe(false)
    expect(res.error).toContain("release parsial")
    expect(costCreateMock).not.toHaveBeenCalled()
    expect(applyDeltaMock).not.toHaveBeenCalled()
  })

  it("update ditolak bila sebagian qty sudah dirilis", async () => {
    costFindUniqueMock.mockResolvedValue({ id: 5, productionOrderId: 1, amount: 100 })
    orderFindUniqueMock.mockResolvedValue(PARTIAL)

    const res = await updateProductionCost(5, fd({ category: "labor", amount: 300 }))

    expect(res.success).toBe(false)
    expect(res.error).toContain("release parsial")
    expect(costUpdateMock).not.toHaveBeenCalled()
    expect(applyDeltaMock).not.toHaveBeenCalled()
  })

  it("delete ditolak bila sebagian qty sudah dirilis", async () => {
    costFindUniqueMock.mockResolvedValue({ id: 5, productionOrderId: 1, amount: 400 })
    orderFindUniqueMock.mockResolvedValue(PARTIAL)

    const res = await deleteProductionCost(5)

    expect(res.success).toBe(false)
    expect(res.error).toContain("release parsial")
    expect(costDeleteMock).not.toHaveBeenCalled()
    expect(applyDeltaMock).not.toHaveBeenCalled()
  })

  it("overhead ditolak bila sebagian qty sudah dirilis", async () => {
    orderFindUniqueMock.mockResolvedValue({ ...PARTIAL, documentNo: "MO-001" })

    const res = await applyOverheadToProductionOrder(
      fd({ productionOrderId: 1, driverType: "machine_hours", driverQty: 2, rate: 1000 }),
    )

    expect(res.success).toBe(false)
    expect(res.error).toContain("release parsial")
    expect(costCreateMock).not.toHaveBeenCalled()
    expect(applyDeltaMock).not.toHaveBeenCalled()
  })

  it("create tetap lolos bila belum ada release (completedQty 0)", async () => {
    orderFindUniqueMock.mockResolvedValue({ id: 1, status: "in_progress", completedQty: 0 })
    costCreateMock.mockResolvedValue({ id: 99 })

    const res = await createProductionCost(fd({ productionOrderId: 1, category: "labor", amount: 1000 }))

    expect(res.success).toBe(true)
    expect(applyDeltaMock).toHaveBeenCalled()
  })
})

describe("pullLaborCostFromTimesheets", () => {
  it("refuses to pull timesheets into a completed production order", async () => {
    woFindUniqueMock.mockResolvedValue({ id: 7, projectId: 3 })
    orderFindUniqueMock.mockResolvedValue({ id: 1, status: "completed" })

    const res = await pullLaborCostFromTimesheets(7, 1, 25000)

    expect(res.success).toBe(false)
    expect(res.error).toContain("completed")
    expect(timesheetFindManyMock).not.toHaveBeenCalled()
    expect(costCreateMock).not.toHaveBeenCalled()
    expect(applyDeltaMock).not.toHaveBeenCalled()
  })

  it("refuses to pull timesheets into a production order of another work order", async () => {
    woFindUniqueMock.mockResolvedValue({ id: 7, projectId: 3 })
    orderFindUniqueMock.mockResolvedValue({ id: 1, status: "in_progress", workOrderId: 99 })

    const res = await pullLaborCostFromTimesheets(7, 1, 25000)

    expect(res.success).toBe(false)
    expect(timesheetFindManyMock).not.toHaveBeenCalled()
    expect(costCreateMock).not.toHaveBeenCalled()
    expect(applyDeltaMock).not.toHaveBeenCalled()
  })

  it("creates one labor line per un-pulled timesheet and rolls the total", async () => {
    woFindUniqueMock.mockResolvedValue({ id: 7, projectId: 3 })
    orderFindUniqueMock.mockResolvedValue({ id: 1 })
    timesheetFindManyMock.mockResolvedValue([
      { id: 11, hours: 4, date: new Date(), description: null },
      { id: 12, hours: 6, date: new Date(), description: "welding" },
    ])
    costFindManyMock.mockResolvedValue([])
    costCreateMock.mockResolvedValue({ id: 1 })

    const res = await pullLaborCostFromTimesheets(7, 1, 25000)

    expect(res.success).toBe(true)
    expect(res.count).toBe(2)
    // 4*25000 + 6*25000 = 250000
    expect(res.added).toBe(250000)
    expect(costCreateMock).toHaveBeenCalledTimes(2)
    expect(applyDeltaMock).toHaveBeenCalledWith(1, 250000, expect.anything(), expect.anything())
    const first = costCreateMock.mock.calls[0][0]
    expect(first.data.sourceTimesheetId).toBe(11)
    expect(Number(first.data.rate)).toBe(25000)
  })

  it("skips timesheets already mapped to an existing cost line", async () => {
    woFindUniqueMock.mockResolvedValue({ id: 7, projectId: 3 })
    orderFindUniqueMock.mockResolvedValue({ id: 1 })
    timesheetFindManyMock.mockResolvedValue([
      { id: 11, hours: 4, date: new Date(), description: null },
      { id: 12, hours: 6, date: new Date(), description: null },
    ])
    costFindManyMock.mockResolvedValue([{ sourceTimesheetId: 11 }])
    costCreateMock.mockResolvedValue({ id: 1 })

    const res = await pullLaborCostFromTimesheets(7, 1, 25000)

    expect(res.success).toBe(true)
    expect(res.count).toBe(1)
    expect(costCreateMock).toHaveBeenCalledTimes(1)
    expect(applyDeltaMock).toHaveBeenCalledWith(1, 150000, expect.anything(), expect.anything())
  })

  it("BUGHUNT r3: dedupe dibaca ulang DI DALAM tx sesudah kunci baris timesheet — temuan in-tx menang atas snapshot luar", async () => {
    woFindUniqueMock.mockResolvedValue({ id: 7, projectId: 3 })
    orderFindUniqueMock.mockResolvedValue({ id: 1 })
    timesheetFindManyMock.mockResolvedValue([
      { id: 11, hours: 4, date: new Date(), description: null },
      { id: 12, hours: 6, date: new Date(), description: null },
    ])
    // Snapshot luar tx: belum ada yang tertarik. Baca ulang dalam tx: 11 sudah
    // tertarik oleh klik paralel yang commit lebih dulu → hanya 12 dibuat.
    costFindManyMock.mockResolvedValueOnce([]).mockResolvedValueOnce([{ sourceTimesheetId: 11 }])
    costCreateMock.mockResolvedValue({ id: 1 })

    const res = await pullLaborCostFromTimesheets(7, 1, 25000)

    expect(res.success).toBe(true)
    expect(res.count).toBe(1)
    expect(res.added).toBe(150000)
    expect(costCreateMock).toHaveBeenCalledTimes(1)
    expect(costCreateMock.mock.calls[0][0].data.sourceTimesheetId).toBe(12)
    expect(applyDeltaMock).toHaveBeenCalledWith(1, 150000, expect.anything(), expect.anything())
    // Kunci baris timesheet kandidat FOR UPDATE mendahului baca ulang dedupe:
    // urutan invocation lock < findMany dalam tx < create. STOK-14 menambah
    // kunci baris order sebelum kunci timesheet (urutan lock global
    // order→timesheet mencegah deadlock dengan completeProductionOrder).
    const tsCall = queryRawMock.mock.calls.findIndex(
      (c) => ((c[0] as TemplateStringsArray).join("?") ?? "").includes("FROM timesheets"),
    )
    expect(tsCall).toBeGreaterThanOrEqual(0)
    const lockOrder = queryRawMock.mock.invocationCallOrder[tsCall]
    const sql = (queryRawMock.mock.calls[tsCall][0] as TemplateStringsArray).join("?")
    expect(sql).toContain("FROM timesheets")
    expect(sql).toContain("FOR UPDATE")
    expect(lockOrder).toBeLessThan(costFindManyMock.mock.invocationCallOrder[1])
    expect(costFindManyMock.mock.invocationCallOrder[1]).toBeLessThan(costCreateMock.mock.invocationCallOrder[0])
    // Query dedupe in-tx menanyakan kandidat global per sourceTimesheetId.
    expect(costFindManyMock.mock.calls[1][0].where).toEqual({ sourceTimesheetId: { in: [11, 12] } })
  })

  it("BUGHUNT r3: semua sudah tertarik menurut baca ulang in-tx → 0 baris, tanpa rollup/log dobel", async () => {
    woFindUniqueMock.mockResolvedValue({ id: 7, projectId: 3 })
    orderFindUniqueMock.mockResolvedValue({ id: 1 })
    timesheetFindManyMock.mockResolvedValue([
      { id: 11, hours: 4, date: new Date(), description: null },
    ])
    // Luar tx belum terlihat (pesaing belum commit); dalam tx sudah ada.
    costFindManyMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ sourceTimesheetId: 11 }])
    costCreateMock.mockResolvedValue({ id: 1 })

    const res = await pullLaborCostFromTimesheets(7, 1, 25000)

    expect(res.success).toBe(true)
    expect(res.count).toBe(0)
    expect(res.added).toBe(0)
    expect(costCreateMock).not.toHaveBeenCalled()
    expect(applyDeltaMock).not.toHaveBeenCalled()
    expect(logActivityMock).not.toHaveBeenCalled()
  })

  it("jam timesheet dinilai ulang dari bacaan terkunci: edit yang commit sesudah snapshot menjadi dasar amount (jalur proyek)", async () => {
    woFindUniqueMock.mockResolvedValue({ id: 7, projectId: 3 })
    orderFindUniqueMock.mockResolvedValue({ id: 1 })
    // Snapshot luar tx membaca 4 jam; bacaan terkunci di dalam tx adalah
    // satu-satunya bacaan konsisten transaksi (snapshot REPEATABLE READ
    // terbentuk sesudah kunci), jadi nilai terkuncilah dasar amount.
    timesheetFindManyMock
      .mockResolvedValueOnce([{ id: 11, hours: 4, date: new Date(), description: null }])
      .mockResolvedValueOnce([{ id: 11, hours: 7, date: new Date(), description: "koreksi" }])
    costFindManyMock.mockResolvedValue([])
    costCreateMock.mockResolvedValue({ id: 1 })

    const res = await pullLaborCostFromTimesheets(7, 1, 25000)

    expect(res.success).toBe(true)
    expect(res.count).toBe(1)
    // Nilai terkunci 7 jam x 25000, BUKAN snapshot 4 jam = 100000.
    expect(res.added).toBe(175000)
    expect(costCreateMock.mock.calls[0][0].data).toMatchObject({
      sourceTimesheetId: 11,
      hours: 7,
      amount: 175000,
      description: "koreksi",
    })
    expect(applyDeltaMock).toHaveBeenCalledWith(1, 175000, expect.anything(), expect.anything())
    // Urutan: kunci baris timesheet mendahului bacaan terkunci.
    const tsCall = queryRawMock.mock.calls.findIndex(
      (c) => ((c[0] as TemplateStringsArray).join("?") ?? "").includes("FROM timesheets"),
    )
    expect(tsCall).toBeGreaterThanOrEqual(0)
    expect(queryRawMock.mock.invocationCallOrder[tsCall]).toBeLessThan(timesheetFindManyMock.mock.invocationCallOrder[1])
    expect(timesheetFindManyMock).toHaveBeenCalledTimes(2)
    // Bacaan terkunci membawa jam/deskripsi di SELECT.
    expect(String(timesheetFindManyMock.mock.calls[1][0].select.hours)).toBe("true")
    expect(String(timesheetFindManyMock.mock.calls[1][0].select.description)).toBe("true")
    // Sisi penulis (updateTimesheet/deleteTimesheet) mengunci baris yang
    // sama, jadi sesudah kunci ini jam beku; test ini membuktikan NILAI
    // yang dipakai adalah bacaan terkunci, bukan snapshot pra-kunci.
  })

  it("fails when the work order has no linked project", async () => {
    woFindUniqueMock.mockResolvedValue({ id: 7, projectId: null })

    const res = await pullLaborCostFromTimesheets(7, 1, 25000)

    expect(res.success).toBe(false)
    expect(res.error).toContain("proyek")
    expect(costCreateMock).not.toHaveBeenCalled()
  })

  it("fails on an invalid rate", async () => {
    const res = await pullLaborCostFromTimesheets(7, 1, -1)

    expect(res.success).toBe(false)
    expect(res.error).toContain("Tarif")
    expect(timesheetFindManyMock).not.toHaveBeenCalled()
  })

  it("menolak tarif 0 di muka (F-2026-10-21-019 putusan final)", async () => {
    const res = await pullLaborCostFromTimesheets(7, 1, 0)

    expect(res.success).toBe(false)
    expect(res.error).toContain("Tarif")
    expect(costCreateMock).not.toHaveBeenCalled()
  })
})

describe("pullLaborCostFromWorkOrderTimesheets — jalur WO langsung (F-2026-10-21-019)", () => {
  it("kunci baris timesheet mendahului baca ulang dedupe di dalam tx (pola jalur proyek)", async () => {
    woFindUniqueMock.mockResolvedValue({ id: 7, status: "in_progress" })
    timesheetFindManyMock.mockResolvedValue([
      { id: 21, hours: 8, date: new Date(), description: null },
      { id: 22, hours: 2, date: new Date(), description: null },
    ])
    // Baca ulang dalam tx: 21 sudah tertarik penarik paralel → hanya 22 dibuat.
    costFindManyMock.mockResolvedValue([{ sourceTimesheetId: 21 }])
    costCreateMock.mockResolvedValue({ id: 1 })

    const res = await pullLaborCostFromWorkOrderTimesheets(7, 25000)

    expect(res.success).toBe(true)
    expect(res.count).toBe(1)
    expect(costCreateMock.mock.calls[0][0].data.sourceTimesheetId).toBe(22)
    const tsCall = queryRawMock.mock.calls.findIndex(
      (c) => ((c[0] as TemplateStringsArray).join("?") ?? "").includes("FROM timesheets"),
    )
    expect(tsCall).toBeGreaterThanOrEqual(0)
    const lockOrder = queryRawMock.mock.invocationCallOrder[tsCall]
    expect(lockOrder).toBeLessThan(costFindManyMock.mock.invocationCallOrder[0])
    expect(costFindManyMock.mock.invocationCallOrder[0]).toBeLessThan(costCreateMock.mock.invocationCallOrder[0])
  })

  it("WO non-proyek: timesheet WO 8 jam menjadi tepat 1 ProductionCost labor tanpa PO/rollup", async () => {
    woFindUniqueMock.mockResolvedValue({ id: 7, status: "in_progress" })
    timesheetFindManyMock.mockResolvedValue([
      { id: 21, hours: 8, date: new Date(), description: null },
    ])
    costFindManyMock.mockResolvedValue([])
    costCreateMock.mockResolvedValue({ id: 1 })

    const res = await pullLaborCostFromWorkOrderTimesheets(7, 25000)

    expect(res.success).toBe(true)
    expect(res.count).toBe(1)
    expect(res.added).toBe(200000)
    expect(costCreateMock).toHaveBeenCalledTimes(1)
    const first = costCreateMock.mock.calls[0][0]
    expect(first.data).toMatchObject({
      productionOrderId: null,
      workOrderId: 7,
      category: "labor",
      hours: 8,
      rate: 25000,
      amount: 200000,
      sourceTimesheetId: 21,
    })
    // Tanpa ProductionOrder: tidak ada rollup HPP / jurnal baru.
    expect(applyDeltaMock).not.toHaveBeenCalled()
    expect(orderFindUniqueMock).not.toHaveBeenCalled()
  })

  it("pull kedua idempoten: 0 baris baru (semesta global per sourceTimesheetId)", async () => {
    woFindUniqueMock.mockResolvedValue({ id: 7, status: "in_progress" })
    timesheetFindManyMock.mockResolvedValue([
      { id: 21, hours: 8, date: new Date(), description: null },
    ])
    // Tarikan pertama: belum ada yang tertarik.
    costFindManyMock.mockResolvedValueOnce([])
    costCreateMock.mockResolvedValue({ id: 1 })
    const first = await pullLaborCostFromWorkOrderTimesheets(7, 25000)
    expect(first.success).toBe(true)
    expect(first.count).toBe(1)

    // Tarikan kedua: sourceTimesheetId 21 sudah punya ProductionCost (konteks mana pun).
    costFindManyMock.mockResolvedValue([{ sourceTimesheetId: 21 }])
    costCreateMock.mockClear()
    const second = await pullLaborCostFromWorkOrderTimesheets(7, 25000)

    expect(second.success).toBe(true)
    expect(second.count).toBe(0)
    expect(second.added).toBe(0)
    expect(costCreateMock).not.toHaveBeenCalled()
    // Penjaga global: query menanyakan sourceTimesheetId kandidat, bukan per-perintah.
    const lastFindManyCall = costFindManyMock.mock.calls.at(-1)
    expect(lastFindManyCall?.[0].where).toEqual({ sourceTimesheetId: { in: [21] } })
  })

  it("status WO dinilai ulang assertJobCostMutable di dalam tx; penolakan guard menghentikan create (putaran 22)", async () => {
    // Suite ini memock job-closeout.service: yang dibuktikan di sini adalah
    // PENEMPATAN guard — jalur WO kini memanggilnya di dalam tx (pola jalur
    // proyek), bukan hanya cek status di luar tx.
    woFindUniqueMock.mockResolvedValue({ id: 7, status: "in_progress" })
    timesheetFindManyMock.mockResolvedValue([
      { id: 21, hours: 8, date: new Date(), description: null },
    ])
    costFindManyMock.mockResolvedValue([])
    jobGuardMock.mockReset()
    jobGuardMock.mockRejectedValue(new Error("Biaya tidak dapat ditambahkan: perintah kerja sudah ditutup (closed)."))

    const res = await pullLaborCostFromWorkOrderTimesheets(7, 25000)

    expect(res.success).toBe(false)
    expect(res.error).toContain("ditutup (closed)")
    expect(jobGuardMock).toHaveBeenCalledWith({ workOrderId: 7 }, "ditambahkan", expect.anything())
    expect(costCreateMock).not.toHaveBeenCalled()
  })

  it.each(["completed", "cancelled"])("pull ke WO %s ditolak menyebut status", async (status) => {
    woFindUniqueMock.mockResolvedValue({ id: 7, status })

    const res = await pullLaborCostFromWorkOrderTimesheets(7, 25000)

    expect(res.success).toBe(false)
    expect(res.error).toContain(status)
    expect(timesheetFindManyMock).not.toHaveBeenCalled()
    expect(costCreateMock).not.toHaveBeenCalled()
  })

  it("menolak tarif <= 0 / tak hingga di muka", async () => {
    for (const rate of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const res = await pullLaborCostFromWorkOrderTimesheets(7, rate)
      expect(res.success).toBe(false)
      expect(res.error).toContain("Tarif")
    }
    expect(costCreateMock).not.toHaveBeenCalled()
  })

  it("WO tidak ditemukan ditolak; tanpa timesheet WO ditolak", async () => {
    woFindUniqueMock.mockResolvedValue(null)
    const missing = await pullLaborCostFromWorkOrderTimesheets(7, 25000)
    expect(missing.success).toBe(false)
    expect(missing.error).toContain("Perintah kerja tidak ditemukan")

    woFindUniqueMock.mockResolvedValue({ id: 7, status: "in_progress" })
    timesheetFindManyMock.mockResolvedValue([])
    const empty = await pullLaborCostFromWorkOrderTimesheets(7, 25000)
    expect(empty.success).toBe(false)
    expect(empty.error).toContain("Tidak ada timesheet")
    expect(costCreateMock).not.toHaveBeenCalled()
  })

  it("jam timesheet dinilai ulang dari bacaan terkunci: edit yang commit sesudah snapshot menjadi dasar amount (jalur WO)", async () => {
    woFindUniqueMock.mockResolvedValue({ id: 7, status: "in_progress" })
    // Snapshot luar tx membaca 8 jam; bacaan terkunci di dalam tx adalah
    // satu-satunya bacaan konsisten transaksi (snapshot REPEATABLE READ
    // terbentuk sesudah kunci), jadi nilai terkuncilah dasar amount.
    timesheetFindManyMock
      .mockResolvedValueOnce([{ id: 21, hours: 8, date: new Date(), description: null }])
      .mockResolvedValueOnce([{ id: 21, hours: 3, date: new Date(), description: "revisi" }])
    costFindManyMock.mockResolvedValue([])
    costCreateMock.mockResolvedValue({ id: 1 })

    const res = await pullLaborCostFromWorkOrderTimesheets(7, 25000)

    expect(res.success).toBe(true)
    expect(res.count).toBe(1)
    // Nilai terkunci 3 jam x 25000, BUKAN snapshot 8 jam = 200000.
    expect(res.added).toBe(75000)
    expect(costCreateMock.mock.calls[0][0].data).toMatchObject({
      sourceTimesheetId: 21,
      hours: 3,
      amount: 75000,
      description: "revisi",
    })
    const tsCall = queryRawMock.mock.calls.findIndex(
      (c) => ((c[0] as TemplateStringsArray).join("?") ?? "").includes("FROM timesheets"),
    )
    expect(tsCall).toBeGreaterThanOrEqual(0)
    expect(queryRawMock.mock.invocationCallOrder[tsCall]).toBeLessThan(timesheetFindManyMock.mock.invocationCallOrder[1])
    expect(timesheetFindManyMock).toHaveBeenCalledTimes(2)
    // Sisi penulis (updateTimesheet/deleteTimesheet) mengunci baris yang
    // sama, jadi sesudah kunci ini jam beku; test ini membuktikan NILAI
    // yang dipakai adalah bacaan terkunci, bukan snapshot pra-kunci.
  })

  it("tanpa izin manage_production_costs ditolak sebelum query apa pun", async () => {
    requirePermissionMock.mockRejectedValue(new Error("Tidak memiliki izin"))

    const res = await pullLaborCostFromWorkOrderTimesheets(7, 25000)

    expect(res.success).toBe(false)
    expect(woFindUniqueMock).not.toHaveBeenCalled()
    expect(costCreateMock).not.toHaveBeenCalled()
  })
})

describe("applyOverheadToProductionOrder (PRD FAB-07)", () => {
  it("applies driver × rate as an overhead applied line and rolls it into HPP", async () => {
    orderFindUniqueMock.mockResolvedValue({ id: 1, status: "in_progress", documentNo: "MO-001" })
    costCreateMock.mockResolvedValue({ id: 77 })

    const res = await applyOverheadToProductionOrder(
      fd({ productionOrderId: 1, driverType: "machine_hours", driverQty: 12, rate: 50000 }),
    )

    expect(res.success).toBe(true)
    expect((res as { amount?: number }).amount).toBe(600000)
    expect(costCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          productionOrderId: 1,
          category: "overhead",
          driverType: "machine_hours",
          isAppliedOverhead: true,
          hours: 12,
          rate: 50000,
          amount: 600000,
        }),
      }),
    )
    expect(applyDeltaMock).toHaveBeenCalledWith(1, 600000, expect.anything(), expect.anything())
  })

  it("rejects a non-positive applied amount", async () => {
    const res = await applyOverheadToProductionOrder(
      fd({ productionOrderId: 1, driverType: "labor_hours", driverQty: 0, rate: 50000 }),
    )
    expect(res.success).toBe(false)
    expect(costCreateMock).not.toHaveBeenCalled()
  })

  it("refuses to apply overhead to a completed order", async () => {
    orderFindUniqueMock.mockResolvedValue({ id: 1, status: "completed" })

    const res = await applyOverheadToProductionOrder(
      fd({ productionOrderId: 1, driverType: "quantity", driverQty: 5, rate: 1000 }),
    )

    expect(res.success).toBe(false)
    expect(res.error).toContain("completed")
    expect(costCreateMock).not.toHaveBeenCalled()
  })

  it("rejects an invalid driver type", async () => {
    const res = await applyOverheadToProductionOrder(
      fd({ productionOrderId: 1, driverType: "bogus", driverQty: 5, rate: 1000 }),
    )
    expect(res.success).toBe(false)
    expect(orderFindUniqueMock).not.toHaveBeenCalled()
  })
})
