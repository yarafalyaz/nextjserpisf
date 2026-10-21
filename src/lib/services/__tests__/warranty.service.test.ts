import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  addCalendarMonths,
  assessWarrantyEligibility,
  buildWarrantyTermsSnapshot,
  createWarrantyClaim,
  createWarrantyCoveragesForWorkOrder,
  decideWarrantyClaim,
  transitionWarrantyClaim,
} from "../warranty.service"
import { prisma } from "@/lib/db/prisma"

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    workOrder: { findUnique: vi.fn() },
    materialIssue: { findMany: vi.fn() },
    item: { findMany: vi.fn() },
    warrantyCoverage: { findMany: vi.fn(), create: vi.fn(), findUnique: vi.fn() },
    warrantyClaim: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    customerVehicle: { update: vi.fn() },
  },
}))

const p = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>

beforeEach(() => {
  vi.clearAllMocks()
  p.warrantyCoverage.findMany.mockResolvedValue([])
  p.warrantyCoverage.create.mockResolvedValue({})
  p.customerVehicle.update.mockResolvedValue({})
})

describe("addCalendarMonths", () => {
  it("adds 12 calendar months and clamps month-end", () => {
    expect(addCalendarMonths(new Date("2026-01-15T00:00:00Z"), 12).toISOString().slice(0, 10)).toBe("2027-01-15")
    expect(addCalendarMonths(new Date("2026-01-31T00:00:00Z"), 1).toISOString().slice(0, 10)).toBe("2026-02-28")
  })
})

describe("createWarrantyCoveragesForWorkOrder (F-021 tahap 1)", () => {
  it("WO completed dengan bumper warrantyMonths=12 → coverage lahir expiresAt +12 bulan, termsSnapshot terisi", async () => {
    p.workOrder.findUnique.mockResolvedValue({ customerVehicleId: 7 })
    p.materialIssue.findMany.mockResolvedValue([
      { items: [{ itemId: 42, serialNumbers: ["BMP-001"] }] },
    ])
    p.item.findMany.mockResolvedValue([{ id: 42, name: "Bumper Baja", sku: "BMP-42", warrantyMonths: 12 }])

    const installedAt = new Date("2026-10-21T03:00:00Z")
    const result = await createWarrantyCoveragesForWorkOrder(99, installedAt, prisma as never)

    expect(result.created).toBe(1)
    expect(p.warrantyCoverage.create).toHaveBeenCalledTimes(1)
    const data = p.warrantyCoverage.create.mock.calls[0][0].data
    expect(data.customerVehicleId).toBe(7)
    expect(data.workOrderId).toBe(99)
    expect(data.itemId).toBe(42)
    expect(data.serialNumber).toBe("BMP-001")
    expect(data.expiresAt.toISOString().slice(0, 10)).toBe("2027-10-21")
    expect(data.termsSnapshot).toContain("12 bulan")
    expect(data.termsSnapshot).toContain("BMP-001")
    expect(data.status).toBe("active")
  })

  it("item tanpa warrantyMonths → nol coverage, bukan error", async () => {
    p.workOrder.findUnique.mockResolvedValue({ customerVehicleId: 7 })
    p.materialIssue.findMany.mockResolvedValue([{ items: [{ itemId: 43, serialNumbers: [] }] }])
    // findMany difilter warrantyMonths not null oleh query; mock mengembalikan kosong.
    p.item.findMany.mockResolvedValue([])

    const result = await createWarrantyCoveragesForWorkOrder(99, new Date(), prisma as never)
    expect(result.created).toBe(0)
    expect(p.warrantyCoverage.create).not.toHaveBeenCalled()
  })

  it("WO tanpa kendaraan → nol coverage", async () => {
    p.workOrder.findUnique.mockResolvedValue({ customerVehicleId: null })
    const result = await createWarrantyCoveragesForWorkOrder(99, new Date(), prisma as never)
    expect(result.created).toBe(0)
    expect(p.materialIssue.findMany).not.toHaveBeenCalled()
  })

  it("idempoten: coverage (WO,item,serial) yang sudah ada tidak dibuat ulang", async () => {
    p.workOrder.findUnique.mockResolvedValue({ customerVehicleId: 7 })
    p.materialIssue.findMany.mockResolvedValue([
      { items: [{ itemId: 42, serialNumbers: ["BMP-001"] }] },
    ])
    p.item.findMany.mockResolvedValue([{ id: 42, name: "Bumper Baja", sku: "BMP-42", warrantyMonths: 12 }])
    p.warrantyCoverage.findMany.mockResolvedValue([{ itemId: 42, serialNumber: "BMP-001" }])

    const result = await createWarrantyCoveragesForWorkOrder(99, new Date(), prisma as never)
    expect(result.created).toBe(0)
    expect(p.warrantyCoverage.create).not.toHaveBeenCalled()
  })

  it("baris tanpa serial → satu coverage serial null per baris", async () => {
    p.workOrder.findUnique.mockResolvedValue({ customerVehicleId: 7 })
    p.materialIssue.findMany.mockResolvedValue([{ items: [{ itemId: 42, serialNumbers: null }] }])
    p.item.findMany.mockResolvedValue([{ id: 42, name: "Bumper Baja", sku: "BMP-42", warrantyMonths: 6 }])

    const result = await createWarrantyCoveragesForWorkOrder(99, new Date(), prisma as never)
    expect(result.created).toBe(1)
    expect(p.warrantyCoverage.create.mock.calls[0][0].data.serialNumber).toBeNull()
  })
})

describe("klaim di luar masa (F-021 AC2): manual, BUKAN auto-reject", () => {
  const expiredCoverage = {
    id: 5,
    customerVehicleId: 7,
    status: "active",
    expiresAt: new Date("2026-01-01T00:00:00Z"),
    mileageLimitKm: null,
    serialNumber: null,
  }

  it("createWarrantyClaim untuk coverage kedaluwarsa tetap lahir status intake (tidak ditolak sistem)", async () => {
    p.warrantyCoverage.findUnique.mockResolvedValue(expiredCoverage)
    p.warrantyClaim.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 1, ...data }))

    const claim = (await createWarrantyClaim(
      { coverageId: 5, reportedAt: new Date("2026-10-21T00:00:00Z"), odometerKm: 50000, complaint: "Bumper retak" },
      prisma as never,
    )) as unknown as { status: string }
    expect(claim.status).toBe("intake")
    expect(p.customerVehicle.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { lastOdometerKm: 50000 },
    })
    // assess hanya memberi fakta; tidak menyentuh status.
    const facts = assessWarrantyEligibility({
      coverage: expiredCoverage,
      reportedAt: new Date("2026-10-21T00:00:00Z"),
      odometerKm: 50000,
    })
    expect(facts.withinPeriod).toBe(false)
    expect(facts.notes.join(" ")).toContain("tidak otomatis ditolak")
  })

  it("rejected hanya lewat decideWarrantyClaim manual dengan pejabat tercatat", async () => {
    p.warrantyClaim.findUnique.mockResolvedValue({ id: 1, status: "eligibility" })
    p.warrantyClaim.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 1, ...data }))

    const decided = (await decideWarrantyClaim(
      { claimId: 1, decision: "rejected", resolutionType: "reject", decisionBy: 9, decisionNotes: "Di luar masa garansi" },
      prisma as never,
    )) as unknown as { status: string; decisionBy: number; resolutionType: string }
    expect(decided.status).toBe("rejected")
    expect(decided.decisionBy).toBe(9)
    expect(decided.resolutionType).toBe("reject")
  })

  it("transitionWarrantyClaim menolak jalur pintas ke approved/rejected", async () => {
    p.warrantyClaim.findUnique.mockResolvedValue({ id: 1, status: "eligibility" })
    await expect(
      transitionWarrantyClaim({ claimId: 1, to: "rejected" }, prisma as never),
    ).rejects.toThrow("decideWarrantyClaim")
  })

  it("keputusan dari status intake (loncat eligibility) ditolak", async () => {
    p.warrantyClaim.findUnique.mockResolvedValue({ id: 1, status: "intake" })
    await expect(
      decideWarrantyClaim(
        { claimId: 1, decision: "approved", resolutionType: "repair", decisionBy: 9 },
        prisma as never,
      ),
    ).rejects.toThrow("tidak diizinkan")
  })

  it("approved dengan resolusi reject ditolak; rejected non-reject ditolak", async () => {
    await expect(
      decideWarrantyClaim(
        { claimId: 1, decision: "approved", resolutionType: "reject", decisionBy: 9 },
        prisma as never,
      ),
    ).rejects.toThrow("tidak boleh beresolusi reject")
    await expect(
      decideWarrantyClaim(
        { claimId: 1, decision: "rejected", resolutionType: "repair", decisionBy: 9 },
        prisma as never,
      ),
    ).rejects.toThrow("wajib beresolusi reject")
  })

  it("rejected→closed sah; closed terminal tidak boleh transisi apa pun", async () => {
    const claim: { id: number; status: string } = { id: 1, status: "eligibility" }
    p.warrantyClaim.findUnique.mockImplementation(async () => ({ ...claim }))
    p.warrantyClaim.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      Object.assign(claim, data)
      return { ...claim }
    })

    await decideWarrantyClaim(
      { claimId: 1, decision: "rejected", resolutionType: "reject", decisionBy: 9 },
      prisma as never,
    )
    expect(claim.status).toBe("rejected")
    await transitionWarrantyClaim({ claimId: 1, to: "closed" }, prisma as never)
    expect(claim.status).toBe("closed")
    for (const to of ["intake", "eligibility", "in_repair"] as const) {
      await expect(transitionWarrantyClaim({ claimId: 1, to }, prisma as never)).rejects.toThrow(
        "tidak diizinkan",
      )
    }
  })

  it("alur sah penuh: intake→eligibility→approved→in_repair→closed", async () => {
    const claim: { id: number; status: string } = { id: 1, status: "intake" }
    p.warrantyClaim.findUnique.mockImplementation(async () => ({ ...claim }))
    p.warrantyClaim.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      Object.assign(claim, data)
      return { ...claim }
    })

    await transitionWarrantyClaim({ claimId: 1, to: "eligibility" }, prisma as never)
    await decideWarrantyClaim(
      { claimId: 1, decision: "approved", resolutionType: "replace", decisionBy: 9 },
      prisma as never,
    )
    const inRepair = (await transitionWarrantyClaim(
      { claimId: 1, to: "in_repair", repairWorkOrderId: 123 },
      prisma as never,
    )) as unknown as { repairWorkOrderId: number }
    expect(inRepair.repairWorkOrderId).toBe(123)
    await transitionWarrantyClaim({ claimId: 1, to: "closed" }, prisma as never)
    expect(claim.status).toBe("closed")
    await expect(transitionWarrantyClaim({ claimId: 1, to: "intake" }, prisma as never)).rejects.toThrow(
      "tidak diizinkan",
    )
  })

  it("keluhan kosong / odometer negatif ditolak di intake", async () => {
    await expect(
      createWarrantyClaim({ coverageId: 5, reportedAt: new Date(), complaint: "  " }, prisma as never),
    ).rejects.toThrow("wajib diisi")
    await expect(
      createWarrantyClaim(
        { coverageId: 5, reportedAt: new Date(), odometerKm: -1, complaint: "Retak" },
        prisma as never,
      ),
    ).rejects.toThrow("tidak valid")
  })
})

describe("buildWarrantyTermsSnapshot", () => {
  it("membekukan masa, tanggal, serial, dan batas odometer", () => {
    const text = buildWarrantyTermsSnapshot({
      itemName: "Rollcage",
      itemSku: "RC-1",
      warrantyMonths: 24,
      installedAt: new Date("2026-10-21T00:00:00Z"),
      expiresAt: new Date("2028-10-21T00:00:00Z"),
      mileageLimitKm: 100000,
      serialNumber: "RC-9",
    })
    expect(text).toContain("24 bulan")
    expect(text).toContain("2028-10-21")
    expect(text).toContain("100000 km")
    expect(text).toContain("RC-9")
  })
})
