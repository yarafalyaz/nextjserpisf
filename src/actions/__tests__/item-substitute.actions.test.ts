import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Aksi substitusi part F-2026-10-22-069-S. Mock Prisma mandiri.
 * Yang dijaga:
 * - izin Q-SUB69-1: kelola master edit_items, lihat view_items, saran
 *   view_work_orders, terapkan edit_work_orders;
 * - AC-SUB69-1: pasangan aktif ganda / asal=pengganti / item jasa /
 *   nonaktif / satuan dasar beda ditolak; nonaktif tanpa hapus;
 * - AC-SUB69-3/4: terapkan hanya lewat reviseWorkOrderItems existing
 *   (mock tx tidak menyediakan stockMove/journalEntry/materialIssue —
 *   jalur tulis kedua = tes meledak), incompatible ditolak server,
 *   unknown lolos + tercatat, alasan wajib, relasi nonaktif saat
 *   simpan ditolak (validasi ulang);
 * - AC-SUB69-10: jejak penerapan berpasangan lama->baru.
 */

const mocks = vi.hoisted(() => {
  const txMock = {
    itemSubstitute: { findUnique: vi.fn(), create: vi.fn() },
  }
  const prismaMock = {
    ...txMock,
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(txMock)),
    item: { findUnique: vi.fn() },
    itemSubstitute: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    workOrder: { findUnique: vi.fn() },
    workOrderItem: { findFirst: vi.fn() },
    activityLog: { create: vi.fn().mockResolvedValue({ id: 1 }) },
    // Sengaja TANPA stockMove/journalEntry/materialIssue/stockReservation:
    // aksi substitusi menulis stok/jurnal/reservasi = tes meledak (BR-SUB69-06).
  }
  const requirePermissionMock = vi.fn().mockResolvedValue({ id: 7 })
  const reviseMock = vi.fn().mockResolvedValue({ success: true, releaseNotice: null })
  return { prismaMock, txMock, requirePermissionMock, reviseMock }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: mocks.requirePermissionMock,
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/actions/inventory.actions", () => ({
  reviseWorkOrderItems: mocks.reviseMock,
}))
vi.mock("@/lib/reports/item-substitute-suggestions-data", () => ({
  getWorkOrderSubstituteSuggestions: vi.fn().mockResolvedValue({
    notice: "n",
    rows: [],
    suggestedLineCount: 0,
  }),
}))
vi.mock("@/lib/services/vehicle-fitment.service", () => ({
  configurationFromCustomerVehicle: vi.fn().mockResolvedValue({
    vehicleBrandId: 1,
    vehicleModelId: 2,
    vehicleVariantId: 3,
    year: 2020,
    drivetrain: null,
    transmission: null,
  }),
  evaluateFitment: vi.fn().mockResolvedValue({
    result: "unknown",
    ruleId: null,
    source: null,
    notes: null,
    reason: "Tidak ada aturan fitment yang cocok; kompatibilitas belum diketahui.",
  }),
}))

import {
  applyWorkOrderItemSubstitute,
  createItemSubstitute,
  setItemSubstituteActive,
} from "../item-substitute.actions"
import { evaluateFitment } from "@/lib/services/vehicle-fitment.service"

function itemRow(id: number, over: Record<string, unknown> = {}) {
  return {
    id,
    name: `Item ${id}`,
    sku: `SKU-${id}`,
    unitOfMeasure: "PCS",
    isActive: true,
    isService: false,
    deletedAt: null,
    cost: 5000,
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermissionMock.mockResolvedValue({ id: 7 })
  mocks.reviseMock.mockResolvedValue({ success: true, releaseNotice: null })
  mocks.prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb(mocks.txMock),
  )
  mocks.txMock.itemSubstitute.findUnique.mockResolvedValue(null)
  mocks.txMock.itemSubstitute.create.mockImplementation(
    async (args: { data: Record<string, unknown> }) => ({ id: 9, ...args.data }),
  )
  mocks.prismaMock.activityLog.create.mockResolvedValue({ id: 1 })
  mocks.prismaMock.item.findUnique.mockImplementation(
    async (args: { where: { id: number } }) => itemRow(args.where.id),
  )
  mocks.prismaMock.itemSubstitute.findFirst.mockResolvedValue({ id: 5 })
  mocks.prismaMock.workOrderItem.findFirst.mockResolvedValue(null)
  mocks.prismaMock.workOrder.findUnique.mockResolvedValue({
    id: 42,
    status: "in_progress",
    customerVehicleId: 8,
    bomRevisionId: null,
  })
})

describe("createItemSubstitute", () => {
  it("izin edit_items; membuat relasi satu arah + jejak created", async () => {
    const res = await createItemSubstitute({ itemId: 1, substituteItemId: 2, notes: "setara" })
    expect(res).toEqual({ success: true, id: 9 })
    expect(mocks.requirePermissionMock).toHaveBeenCalledWith("edit_items")
    const data = mocks.txMock.itemSubstitute.create.mock.calls[0][0].data
    expect(data).toMatchObject({ itemId: 1, substituteItemId: 2, notes: "setara", createdBy: 7 })
    const log = mocks.prismaMock.activityLog.create.mock.calls[0][0].data
    expect(log.action).toBe("item_substitute_created")
    expect(log.newValues).toMatchObject({ itemId: 1, substituteItemId: 2 })
  })

  it("asal = pengganti ditolak sebelum query tulis", async () => {
    const res = await createItemSubstitute({ itemId: 1, substituteItemId: 1 })
    expect(res.success).toBe(false)
    expect(mocks.txMock.itemSubstitute.create).not.toHaveBeenCalled()
  })

  it("AC-SUB69-1: pasangan aktif ganda ditolak", async () => {
    mocks.txMock.itemSubstitute.findUnique.mockResolvedValue({ id: 3, isActive: true })
    const res = await createItemSubstitute({ itemId: 1, substituteItemId: 2 })
    expect(res).toEqual({
      success: false,
      error: "Pasangan substitusi ini sudah aktif — pasangan aktif ganda ditolak",
    })
    expect(mocks.txMock.itemSubstitute.create).not.toHaveBeenCalled()
  })

  it("item jasa sebagai pengganti ditolak (BR-SUB69-01)", async () => {
    mocks.prismaMock.item.findUnique.mockImplementation(
      async (args: { where: { id: number } }) =>
        args.where.id === 2 ? itemRow(2, { isService: true }) : itemRow(args.where.id),
    )
    const res = await createItemSubstitute({ itemId: 1, substituteItemId: 2 })
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toContain("jasa")
  })

  it("satuan dasar beda ditolak tahap ini", async () => {
    mocks.prismaMock.item.findUnique.mockImplementation(
      async (args: { where: { id: number } }) =>
        args.where.id === 2 ? itemRow(2, { unitOfMeasure: "MTR" }) : itemRow(args.where.id),
    )
    const res = await createItemSubstitute({ itemId: 1, substituteItemId: 2 })
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toContain("Satuan dasar")
  })
})

describe("setItemSubstituteActive", () => {
  it("nonaktifkan = update isActive false, bukan hapus (riwayat utuh)", async () => {
    mocks.prismaMock.itemSubstitute.findUnique.mockResolvedValue({
      id: 5,
      itemId: 1,
      substituteItemId: 2,
      isActive: true,
    })
    const res = await setItemSubstituteActive({ id: 5, isActive: false })
    expect(res).toEqual({ success: true })
    expect(mocks.prismaMock.itemSubstitute.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { isActive: false },
    })
    const log = mocks.prismaMock.activityLog.create.mock.calls[0][0].data
    expect(log.action).toBe("item_substitute_deactivated")
  })
})

function applyInput(over: Record<string, unknown> = {}) {
  return {
    workOrderId: 42,
    workOrderItemId: 11,
    substituteItemId: 2,
    reason: "stok asal habis",
    ...over,
  }
}

function woLine(over: Record<string, unknown> = {}) {
  return { id: 11, itemId: 1, qty: 4, status: "pending", description: null, ...over }
}

describe("applyWorkOrderItemSubstitute", () => {
  beforeEach(() => {
    vi.mocked(evaluateFitment).mockResolvedValue({
      result: "unknown",
      ruleId: null,
      source: null,
      notes: null,
      reason: "Tidak ada aturan fitment yang cocok; kompatibilitas belum diketahui.",
    })
    mocks.prismaMock.workOrderItem.findFirst
      .mockResolvedValueOnce(woLine())
      .mockResolvedValue({ id: 77 })
  })

  it("AC-SUB69-3: menerapkan hanya lewat reviseWorkOrderItems + jejak berpasangan; unknown tercatat peringatan", async () => {
    const res = await applyWorkOrderItemSubstitute(applyInput())
    expect(res).toEqual({ success: true, releaseNotice: null })
    expect(mocks.requirePermissionMock).toHaveBeenCalledWith("edit_work_orders")
    expect(mocks.reviseMock).toHaveBeenCalledTimes(1)
    const revised = mocks.reviseMock.mock.calls[0][0]
    expect(revised).toMatchObject({ workOrderId: 42, replacedItemIds: [11] })
    expect(revised.newItems).toEqual([{ itemId: 2, qty: 4, cost: 5000 }])
    const log = mocks.prismaMock.activityLog.create.mock.calls[0][0].data
    expect(log.action).toBe("work_order_item_substituted")
    expect(log.oldValues).toMatchObject({ workOrderItemId: 11, itemId: 1, qty: 4 })
    expect(log.newValues).toMatchObject({
      workOrderItemId: 77,
      itemId: 2,
      qty: 4,
      fitment: "unknown",
      reason: "stok asal habis",
    })
    expect(log.description).toContain("peringatan")
  })

  it("alasan wajib: kosong ditolak sebelum revisi apa pun", async () => {
    const res = await applyWorkOrderItemSubstitute(applyInput({ reason: "  " }))
    expect(res).toEqual({ success: false, error: "Alasan substitusi wajib diisi" })
    expect(mocks.reviseMock).not.toHaveBeenCalled()
  })

  it("AC-SUB69-4: fitment incompatible ditolak KERAS server, revisi tidak dipanggil", async () => {
    vi.mocked(evaluateFitment).mockResolvedValue({
      result: "incompatible",
      ruleId: 3,
      source: null,
      notes: null,
      reason: "Tidak cocok menurut aturan fitment.",
    })
    const res = await applyWorkOrderItemSubstitute(applyInput())
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toContain("Substitusi ditolak")
    expect(mocks.reviseMock).not.toHaveBeenCalled()
  })

  it("validasi ulang saat simpan: relasi dinonaktifkan di antara saran dan simpan ditolak", async () => {
    mocks.prismaMock.itemSubstitute.findFirst.mockResolvedValue(null)
    const res = await applyWorkOrderItemSubstitute(applyInput())
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toContain("muat ulang saran")
    expect(mocks.reviseMock).not.toHaveBeenCalled()
  })

  it("baris sudah replaced ditolak; baris jasa ditolak", async () => {
    mocks.prismaMock.workOrderItem.findFirst.mockReset()
    mocks.prismaMock.workOrderItem.findFirst.mockResolvedValue(woLine({ status: "replaced" }))
    const replaced = await applyWorkOrderItemSubstitute(applyInput())
    expect(replaced.success).toBe(false)
    mocks.prismaMock.workOrderItem.findFirst.mockResolvedValue(woLine({ itemId: 0 }))
    const service = await applyWorkOrderItemSubstitute(applyInput())
    expect(service.success).toBe(false)
    expect(mocks.reviseMock).not.toHaveBeenCalled()
  })

  it("qty eksplisit pengaju diteruskan apa adanya (BR-SUB69-09)", async () => {
    const res = await applyWorkOrderItemSubstitute(applyInput({ qty: 6 }))
    expect(res.success).toBe(true)
    expect(mocks.reviseMock.mock.calls[0][0].newItems[0].qty).toBe(6)
  })

  it("penolakan guard revisi existing diteruskan apa adanya (baris ter-issue)", async () => {
    mocks.reviseMock.mockResolvedValue({
      success: false,
      error: "Sebagian item sudah dikeluarkan lewat Pengeluaran Material selesai",
    })
    const res = await applyWorkOrderItemSubstitute(applyInput())
    expect(res).toEqual({
      success: false,
      error: "Sebagian item sudah dikeluarkan lewat Pengeluaran Material selesai",
    })
    expect(mocks.prismaMock.activityLog.create).not.toHaveBeenCalled()
  })
})
