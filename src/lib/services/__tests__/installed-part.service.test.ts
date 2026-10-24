import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  createInstalledPartsForMaterialIssue,
  createInstalledPartsForWorkOrder,
  deriveInstalledPartStatus,
  recordInstalledPartRemoval,
} from "../installed-part.service"
import { prisma } from "@/lib/db/prisma"

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    workOrder: { findUnique: vi.fn() },
    project: { findUnique: vi.fn() },
    materialIssue: { findMany: vi.fn(), findUnique: vi.fn() },
    warrantyCoverage: { findMany: vi.fn() },
    installedPart: { findMany: vi.fn(), create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  },
}))

const p = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>

beforeEach(() => {
  vi.clearAllMocks()
  p.warrantyCoverage.findMany.mockResolvedValue([])
  p.installedPart.findMany.mockResolvedValue([])
  p.installedPart.create.mockResolvedValue({})
  p.installedPart.update.mockResolvedValue({ id: 1 })
})

describe("deriveInstalledPartStatus (BR-IP-05)", () => {
  it("0 → TERPASANG, sebagian → SEBAGIAN_DILEPAS, penuh → DILEPAS", () => {
    expect(deriveInstalledPartStatus(4, 0)).toBe("TERPASANG")
    expect(deriveInstalledPartStatus(4, 1)).toBe("SEBAGIAN_DILEPAS")
    expect(deriveInstalledPartStatus(4, 4)).toBe("DILEPAS")
    expect(deriveInstalledPartStatus(1, 1)).toBe("DILEPAS")
  })
})

describe("createInstalledPartsForWorkOrder (AC-IP-1/3/4/6)", () => {
  it("part NON-garansi lahir juga (coverage kosong tidak menghalangi)", async () => {
    p.workOrder.findUnique.mockResolvedValue({ customerVehicleId: 7 })
    p.materialIssue.findMany.mockResolvedValue([
      { items: [{ id: 11, itemId: 43, qty: 2, serialNumbers: null }] },
    ])
    const r = await createInstalledPartsForWorkOrder(99, new Date("2026-10-22"), prisma as never)
    expect(r).toEqual({ created: 1, skipped: 0 })
    const data = p.installedPart.create.mock.calls[0][0].data
    expect(data).toMatchObject({
      customerVehicleId: 7, itemId: 43, materialIssueItemId: 11,
      serialNumber: null, serialKey: "", warrantyCoverageId: null,
    })
    expect(Number(data.qty)).toBe(2)
  })

  it("serial 3 unit → 3 baris qty=1 serial persis; coverage tertaut per serial (AC-IP-3/6)", async () => {
    p.workOrder.findUnique.mockResolvedValue({ customerVehicleId: 7 })
    p.materialIssue.findMany.mockResolvedValue([
      { items: [{ id: 11, itemId: 42, qty: 3, serialNumbers: ["S-1", "S-2", "S-3"] }] },
    ])
    p.warrantyCoverage.findMany.mockResolvedValue([
      { id: 501, itemId: 42, serialNumber: "S-2" },
    ])
    const r = await createInstalledPartsForWorkOrder(99, new Date(), prisma as never)
    expect(r.created).toBe(3)
    const datas = p.installedPart.create.mock.calls.map((c) => c[0].data)
    expect(datas.map((d) => d.serialNumber)).toEqual(["S-1", "S-2", "S-3"])
    expect(datas.every((d) => Number(d.qty) === 1)).toBe(true)
    expect(datas.find((d) => d.serialNumber === "S-2")?.warrantyCoverageId).toBe(501)
    expect(datas.find((d) => d.serialNumber === "S-1")?.warrantyCoverageId).toBeNull()
  })

  it("idempoten: baris existing (issueItem, serialKey) tidak dibuat ulang (AC-IP-2)", async () => {
    p.workOrder.findUnique.mockResolvedValue({ customerVehicleId: 7 })
    p.materialIssue.findMany.mockResolvedValue([
      { items: [{ id: 11, itemId: 42, qty: 1, serialNumbers: ["S-1"] }] },
    ])
    p.installedPart.findMany.mockResolvedValue([{ materialIssueItemId: 11, serialKey: "S-1" }])
    const r = await createInstalledPartsForWorkOrder(99, new Date(), prisma as never)
    expect(r.created).toBe(0)
    expect(p.installedPart.create).not.toHaveBeenCalled()
  })

  it("P2002 dari unique DB ditelan sebagai sudah-ada, bukan error", async () => {
    p.workOrder.findUnique.mockResolvedValue({ customerVehicleId: 7 })
    p.materialIssue.findMany.mockResolvedValue([
      { items: [{ id: 11, itemId: 42, qty: 1, serialNumbers: ["S-1"] }] },
    ])
    p.installedPart.create.mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002" }))
    const r = await createInstalledPartsForWorkOrder(99, new Date(), prisma as never)
    expect(r.created).toBe(0)
  })

  it("WO tanpa kendaraan → 0 baris + skipped terhitung, tanpa create (AC-IP-4)", async () => {
    p.workOrder.findUnique.mockResolvedValue({ customerVehicleId: null })
    p.materialIssue.findMany.mockResolvedValue([
      { items: [{ id: 11, itemId: 42, qty: 1, serialNumbers: [] }, { id: 12, itemId: 43, qty: 5, serialNumbers: null }] },
    ])
    const r = await createInstalledPartsForWorkOrder(99, new Date(), prisma as never)
    expect(r).toEqual({ created: 0, skipped: 2 })
    expect(p.installedPart.create).not.toHaveBeenCalled()
  })
})

describe("createInstalledPartsForMaterialIssue (AC-IP-10, Q-IP-1)", () => {
  it("MI proyek ber-kendaraan lahir; installedAt = tanggal issue", async () => {
    p.materialIssue.findUnique.mockResolvedValue({
      workOrderId: null, projectId: 8, date: new Date("2026-10-20"),
      items: [{ id: 21, itemId: 42, qty: 1, serialNumbers: ["PX-1"] }],
    })
    p.project.findUnique.mockResolvedValue({ customerVehicleId: 9 })
    const r = await createInstalledPartsForMaterialIssue(55, prisma as never)
    expect(r).toEqual({ created: 1, skipped: 0 })
    const data = p.installedPart.create.mock.calls[0][0].data
    expect(data.customerVehicleId).toBe(9)
    expect(data.installedAt.toISOString().slice(0, 10)).toBe("2026-10-20")
    expect(data.warrantyCoverageId).toBeNull()
    expect(p.warrantyCoverage.findMany).not.toHaveBeenCalled()
  })

  it("MI taut WO dilewati di jalur ini (lahir saat WO selesai)", async () => {
    p.materialIssue.findUnique.mockResolvedValue({
      workOrderId: 99, projectId: 8, date: new Date(),
      items: [{ id: 21, itemId: 42, qty: 1, serialNumbers: [] }],
    })
    const r = await createInstalledPartsForMaterialIssue(55, prisma as never)
    expect(r).toEqual({ created: 0, skipped: 0 })
    expect(p.project.findUnique).not.toHaveBeenCalled()
  })

  it("MI bebas (tanpa proyek) tidak ditebak kendaraannya", async () => {
    p.materialIssue.findUnique.mockResolvedValue({
      workOrderId: null, projectId: null, date: new Date(),
      items: [{ id: 21, itemId: 42, qty: 1, serialNumbers: [] }],
    })
    const r = await createInstalledPartsForMaterialIssue(55, prisma as never)
    expect(r).toEqual({ created: 0, skipped: 0 })
    expect(p.installedPart.create).not.toHaveBeenCalled()
  })

  it("proyek tanpa kendaraan → skipped, issue tetap selesai", async () => {
    p.materialIssue.findUnique.mockResolvedValue({
      workOrderId: null, projectId: 8, date: new Date(),
      items: [{ id: 21, itemId: 42, qty: 2, serialNumbers: null }],
    })
    p.project.findUnique.mockResolvedValue({ customerVehicleId: null })
    const r = await createInstalledPartsForMaterialIssue(55, prisma as never)
    expect(r).toEqual({ created: 0, skipped: 1 })
    expect(p.installedPart.create).not.toHaveBeenCalled()
  })
})

describe("recordInstalledPartRemoval (AC-IP-5)", () => {
  it("alasan kosong ditolak; qty <= 0 ditolak", async () => {
    await expect(
      recordInstalledPartRemoval({ installedPartId: 1, qtyRemoved: 1, removalReason: "  ", removedById: 3 }, prisma as never),
    ).rejects.toThrow("wajib diisi")
    await expect(
      recordInstalledPartRemoval({ installedPartId: 1, qtyRemoved: 0, removalReason: "Rusak", removedById: 3 }, prisma as never),
    ).rejects.toThrow("lebih dari nol")
  })

  it("lepas sebagian: qtyRemoved kumulatif, removedAt tetap null", async () => {
    p.installedPart.findUnique.mockResolvedValue({ id: 1, customerVehicleId: 7, qty: 4, qtyRemoved: 1 })
    await recordInstalledPartRemoval(
      { installedPartId: 1, qtyRemoved: 1, removalReason: "Diganti sebagian", removedById: 3 },
      prisma as never,
    )
    const data = p.installedPart.update.mock.calls[0][0].data
    expect(Number(data.qtyRemoved)).toBe(2)
    expect(data.removedAt).toBeNull()
    expect(data.removedById).toBe(3)
    expect(data.removalReason).toBe("Diganti sebagian")
  })

  it("lepas penuh: removedAt terisi dari waktu catat", async () => {
    p.installedPart.findUnique.mockResolvedValue({ id: 1, customerVehicleId: 7, qty: 1, qtyRemoved: 0 })
    const at = new Date("2026-10-22T05:00:00Z")
    await recordInstalledPartRemoval(
      { installedPartId: 1, qtyRemoved: 1, removalReason: "Lepas total", removedById: 3, removedAt: at },
      prisma as never,
    )
    const data = p.installedPart.update.mock.calls[0][0].data
    expect(data.removedAt).toBe(at)
  })

  it("qty melebihi sisa ditolak", async () => {
    p.installedPart.findUnique.mockResolvedValue({ id: 1, customerVehicleId: 7, qty: 2, qtyRemoved: 1 })
    await expect(
      recordInstalledPartRemoval({ installedPartId: 1, qtyRemoved: 2, removalReason: "X", removedById: 3 }, prisma as never),
    ).rejects.toThrow("melebihi sisa")
    expect(p.installedPart.update).not.toHaveBeenCalled()
  })

  it("pengganti kendaraan lain / sudah DILEPAS ditolak; pengganti sah tertaut", async () => {
    p.installedPart.findUnique
      .mockResolvedValueOnce({ id: 1, customerVehicleId: 7, qty: 1, qtyRemoved: 0 })
      .mockResolvedValueOnce({ id: 2, customerVehicleId: 8, qty: 1, qtyRemoved: 0 })
    await expect(
      recordInstalledPartRemoval(
        { installedPartId: 1, qtyRemoved: 1, removalReason: "Ganti", removedById: 3, replacedByInstalledPartId: 2 },
        prisma as never,
      ),
    ).rejects.toThrow("kendaraan yang sama")

    p.installedPart.findUnique
      .mockResolvedValueOnce({ id: 1, customerVehicleId: 7, qty: 1, qtyRemoved: 0 })
      .mockResolvedValueOnce({ id: 2, customerVehicleId: 7, qty: 1, qtyRemoved: 0 })
    await recordInstalledPartRemoval(
      { installedPartId: 1, qtyRemoved: 1, removalReason: "Ganti", removedById: 3, replacedByInstalledPartId: 2 },
      prisma as never,
    )
    expect(p.installedPart.update.mock.calls[0][0].data.replacedByInstalledPartId).toBe(2)
  })
})
