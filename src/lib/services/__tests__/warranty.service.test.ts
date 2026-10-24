import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  addCalendarMonths,
  assessWarrantyEligibility,
  buildWarrantyTermsSnapshot,
  createWarrantyClaim,
  createWarrantyCoveragesForWorkOrder,
  decideWarrantyClaim,
  linkSupplierClaim,
  linkSupplierClaimVendorOnly,
  transitionSupplierClaim,
  transitionWarrantyClaim,
} from "../warranty.service"
import { prisma } from "@/lib/db/prisma"

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    workOrder: { findUnique: vi.fn() },
    materialIssue: { findMany: vi.fn() },
    item: { findMany: vi.fn() },
    warrantyCoverage: { findMany: vi.fn(), create: vi.fn(), findUnique: vi.fn() },
    warrantyClaim: { create: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    customerVehicle: { update: vi.fn() },
    vendor: { findUnique: vi.fn() },
    purchaseReturn: { findUnique: vi.fn() },
    transactionAttachment: { count: vi.fn() },
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
    // Jangkar unik DB: serial null ditulis sebagai serialKey "" (bukan null).
    expect(p.warrantyCoverage.create.mock.calls[0][0].data.serialKey).toBe("")
  })

  it("F-021-HARDEN-UNIQUE: serialKey = serialNumber saat create", async () => {
    p.workOrder.findUnique.mockResolvedValue({ customerVehicleId: 7 })
    p.materialIssue.findMany.mockResolvedValue([
      { items: [{ itemId: 42, serialNumbers: ["BMP-001"] }] },
    ])
    p.item.findMany.mockResolvedValue([{ id: 42, name: "Bumper Baja", sku: "BMP-42", warrantyMonths: 12 }])

    const result = await createWarrantyCoveragesForWorkOrder(99, new Date(), prisma as never)
    expect(result.created).toBe(1)
    expect(p.warrantyCoverage.create.mock.calls[0][0].data.serialKey).toBe("BMP-001")
  })

  it("F-021-HARDEN-UNIQUE: P2002 dari unique DB ditelan sebagai sudah-ada, bukan error", async () => {
    p.workOrder.findUnique.mockResolvedValue({ customerVehicleId: 7 })
    p.materialIssue.findMany.mockResolvedValue([
      { items: [{ itemId: 42, serialNumbers: ["BMP-001"] }] },
    ])
    p.item.findMany.mockResolvedValue([{ id: 42, name: "Bumper Baja", sku: "BMP-42", warrantyMonths: 12 }])
    // Balapan: cek baca melihat kosong, tapi transaksi lain menang create duluan.
    p.warrantyCoverage.create.mockRejectedValue(Object.assign(new Error("Unique constraint failed"), { code: "P2002" }))

    const result = await createWarrantyCoveragesForWorkOrder(99, new Date(), prisma as never)
    expect(result.created).toBe(0)
  })

  it("F-021-HARDEN-UNIQUE: error non-P2002 saat create tetap diteruskan", async () => {
    p.workOrder.findUnique.mockResolvedValue({ customerVehicleId: 7 })
    p.materialIssue.findMany.mockResolvedValue([
      { items: [{ itemId: 42, serialNumbers: ["BMP-001"] }] },
    ])
    p.item.findMany.mockResolvedValue([{ id: 42, name: "Bumper Baja", sku: "BMP-42", warrantyMonths: 12 }])
    p.warrantyCoverage.create.mockRejectedValue(new Error("DB mati"))

    await expect(createWarrantyCoveragesForWorkOrder(99, new Date(), prisma as never)).rejects.toThrow("DB mati")
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

describe("tautan klaim supplier (F-2026-10-21-022): tautan saja, tanpa jurnal", () => {
  const baseClaim: {
    id: number
    status: string
    resolutionType: string | null
    supplierClaimVendorId: number | null
    purchaseReturnId: number | null
    supplierClaimStatus: string
    supplierClaimRefNo: string | null
    supplierClaimNotes: string | null
    supplierClaimBy: number | null
    coverage: { itemId: number; serialNumber: string | null }
  } = {
    id: 1,
    status: "approved",
    resolutionType: "replace",
    supplierClaimVendorId: null,
    purchaseReturnId: null,
    supplierClaimStatus: "none",
    supplierClaimRefNo: null,
    supplierClaimNotes: null,
    supplierClaimBy: null,
    coverage: { itemId: 42, serialNumber: "SN-1" },
  }
  const draftReturn = {
    id: 9,
    status: "draft",
    purchaseOrder: { vendorId: 5 },
    items: [{ itemId: 42, serialNumbers: ["SN-1"] }],
  }

  function seedLink(claim = baseClaim, ret: unknown = draftReturn) {
    p.warrantyClaim.findUnique.mockResolvedValue(claim)
    p.vendor.findUnique.mockResolvedValue({ id: 5, isActive: true, deletedAt: null })
    p.purchaseReturn.findUnique.mockResolvedValue(ret)
    p.warrantyClaim.findFirst.mockResolvedValue(null)
    p.transactionAttachment.count.mockResolvedValue(1)
    p.warrantyClaim.update.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({ id: 1, ...data }),
    )
  }

  it("tautan sah: vendor+item+serial cocok → drafted, ID tautan terisi", async () => {
    seedLink()
    const linked = (await linkSupplierClaim(
      { claimId: 1, supplierClaimVendorId: 5, purchaseReturnId: 9, actorUserId: 7 },
      prisma as never,
    )) as unknown as { supplierClaimStatus: string; purchaseReturnId: number; supplierClaimVendorId: number }
    expect(linked.supplierClaimStatus).toBe("drafted")
    expect(linked.purchaseReturnId).toBe(9)
    expect(linked.supplierClaimVendorId).toBe(5)
  })

  it("FALSIFIKASI vendor mismatch: vendor PO retur ≠ vendor klaim → ditolak", async () => {
    seedLink(baseClaim, { ...draftReturn, purchaseOrder: { vendorId: 99 } })
    await expect(
      linkSupplierClaim(
        { claimId: 1, supplierClaimVendorId: 5, purchaseReturnId: 9, actorUserId: 7 },
        prisma as never,
      ),
    ).rejects.toThrow("bukan milik vendor")
    expect(p.warrantyClaim.update).not.toHaveBeenCalled()
  })

  it("FALSIFIKASI item mismatch: retur tidak memuat coverage.itemId → ditolak", async () => {
    seedLink(baseClaim, { ...draftReturn, items: [{ itemId: 77, serialNumbers: ["SN-1"] }] })
    await expect(
      linkSupplierClaim(
        { claimId: 1, supplierClaimVendorId: 5, purchaseReturnId: 9, actorUserId: 7 },
        prisma as never,
      ),
    ).rejects.toThrow("tidak memuat item")
  })

  it("FALSIFIKASI serial mismatch: coverage SN-1, retur serial lain → ditolak", async () => {
    seedLink(baseClaim, { ...draftReturn, items: [{ itemId: 42, serialNumbers: ["SN-LAIN"] }] })
    await expect(
      linkSupplierClaim(
        { claimId: 1, supplierClaimVendorId: 5, purchaseReturnId: 9, actorUserId: 7 },
        prisma as never,
      ),
    ).rejects.toThrow("Nomor seri")
  })

  it("coverage tanpa serial: pencocokan turun ke itemId saja → lolos", async () => {
    seedLink(
      { ...baseClaim, coverage: { itemId: 42, serialNumber: null } },
      { ...draftReturn, items: [{ itemId: 42, serialNumbers: null }] },
    )
    const linked = (await linkSupplierClaim(
      { claimId: 1, supplierClaimVendorId: 5, purchaseReturnId: 9, actorUserId: 7 },
      prisma as never,
    )) as unknown as { supplierClaimStatus: string }
    expect(linked.supplierClaimStatus).toBe("drafted")
  })

  it("FALSIFIKASI klaim belum approved → tautan ditolak", async () => {
    seedLink({ ...baseClaim, status: "eligibility" })
    await expect(
      linkSupplierClaim(
        { claimId: 1, supplierClaimVendorId: 5, purchaseReturnId: 9, actorUserId: 7 },
        prisma as never,
      ),
    ).rejects.toThrow("sesudah klaim garansi disetujui")
  })

  it("FALSIFIKASI resolusi repair (bukan replace) → tautan ditolak", async () => {
    seedLink({ ...baseClaim, resolutionType: "repair" })
    await expect(
      linkSupplierClaim(
        { claimId: 1, supplierClaimVendorId: 5, purchaseReturnId: 9, actorUserId: 7 },
        prisma as never,
      ),
    ).rejects.toThrow("replace")
  })

  it("FALSIFIKASI retur sudah returned / sudah tertaut klaim aktif lain → ditolak", async () => {
    seedLink(baseClaim, { ...draftReturn, status: "returned" })
    await expect(
      linkSupplierClaim(
        { claimId: 1, supplierClaimVendorId: 5, purchaseReturnId: 9, actorUserId: 7 },
        prisma as never,
      ),
    ).rejects.toThrow("draft")
    seedLink()
    p.warrantyClaim.findFirst.mockResolvedValue({ id: 2 })
    await expect(
      linkSupplierClaim(
        { claimId: 1, supplierClaimVendorId: 5, purchaseReturnId: 9, actorUserId: 7 },
        prisma as never,
      ),
    ).rejects.toThrow("sudah tertaut")
  })

  it("FALSIFIKASI vendor nonaktif → ditolak eksplisit", async () => {
    seedLink()
    p.vendor.findUnique.mockResolvedValue({ id: 5, isActive: false, deletedAt: null })
    await expect(
      linkSupplierClaim(
        { claimId: 1, supplierClaimVendorId: 5, purchaseReturnId: 9, actorUserId: 7 },
        prisma as never,
      ),
    ).rejects.toThrow("tidak aktif")
  })

  it("jalur vendor-saja tanpa PO: notes wajib, purchaseReturnId tetap null", async () => {
    seedLink()
    const linked = (await linkSupplierClaimVendorOnly(
      {
        claimId: 1,
        supplierClaimVendorId: 5,
        actorUserId: 7,
        supplierClaimNotes: "Part stok lama, tanpa PO asal",
      },
      prisma as never,
    )) as unknown as { supplierClaimStatus: string; purchaseReturnId: null }
    expect(linked.supplierClaimStatus).toBe("drafted")
    expect(linked.purchaseReturnId).toBeNull()
    await expect(
      linkSupplierClaimVendorOnly(
        { claimId: 1, supplierClaimVendorId: 5, actorUserId: 7, supplierClaimNotes: "  " },
        prisma as never,
      ),
    ).rejects.toThrow("Catatan wajib")
  })

  it("FALSIFIKASI sent tanpa ref/resi → ditolak; tanpa foto → ditolak; penyetuju=pembuat → ditolak", async () => {
    seedLink({ ...baseClaim, supplierClaimStatus: "drafted", supplierClaimBy: 7 })
    await expect(
      transitionSupplierClaim({ claimId: 1, to: "sent", actorUserId: 8 }, prisma as never),
    ).rejects.toThrow("Nomor klaim supplier")
    seedLink({ ...baseClaim, supplierClaimStatus: "drafted", supplierClaimRefNo: "RESI-1", supplierClaimBy: 7 })
    p.transactionAttachment.count.mockResolvedValue(0)
    await expect(
      transitionSupplierClaim({ claimId: 1, to: "sent", actorUserId: 8 }, prisma as never),
    ).rejects.toThrow("Foto bukti")
    seedLink({ ...baseClaim, supplierClaimStatus: "drafted", supplierClaimRefNo: "RESI-1", supplierClaimBy: 7 })
    await expect(
      transitionSupplierClaim({ claimId: 1, to: "sent", actorUserId: 7 }, prisma as never),
    ).rejects.toThrow("tidak boleh sama")
    const sent = (await transitionSupplierClaim(
      { claimId: 1, to: "sent", actorUserId: 8 },
      prisma as never,
    )) as unknown as { supplierClaimStatus: string }
    expect(sent.supplierClaimStatus).toBe("sent")
  })

  it("E130-1: transisi sent membekukan penanda resi di notes existing (pembanding E3, tanpa kolom)", async () => {
    seedLink({ ...baseClaim, supplierClaimStatus: "drafted", supplierClaimRefNo: "RESI-77", supplierClaimNotes: "Kirim via ekspedisi", supplierClaimBy: 7 })
    p.transactionAttachment.count.mockResolvedValue(1)
    await transitionSupplierClaim({ claimId: 1, to: "sent", actorUserId: 8 }, prisma as never)
    const data = p.warrantyClaim.update.mock.calls.at(-1)?.[0]?.data as { supplierClaimNotes?: string }
    expect(data.supplierClaimNotes).toContain("Kirim via ekspedisi")
    expect(data.supplierClaimNotes).toContain("[Resi pengiriman klaim supplier: RESI-77]")
  })

  it("alur penuh drafted→sent→accepted→returned→closed_recovered; status klaim pelanggan tidak disentuh", async () => {
    const state: Record<string, unknown> = {
      ...baseClaim,
      supplierClaimStatus: "drafted",
      supplierClaimVendorId: 5,
      purchaseReturnId: 9,
      supplierClaimBy: 7,
    }
    p.warrantyClaim.findUnique.mockImplementation(async () => ({ ...state }))
    p.purchaseReturn.findUnique.mockResolvedValue({ status: "returned" })
    p.transactionAttachment.count.mockResolvedValue(2)
    p.warrantyClaim.update.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(state, data)
        return { ...state }
      },
    )
    await transitionSupplierClaim(
      { claimId: 1, to: "sent", actorUserId: 8, supplierClaimRefNo: "RMA-9" },
      prisma as never,
    )
    await transitionSupplierClaim(
      { claimId: 1, to: "accepted", actorUserId: 7, supplierClaimNotes: "Supplier setuju ganti" },
      prisma as never,
    )
    await transitionSupplierClaim({ claimId: 1, to: "returned", actorUserId: 7 }, prisma as never)
    await transitionSupplierClaim({ claimId: 1, to: "closed_recovered", actorUserId: 7 }, prisma as never)
    expect(state.supplierClaimStatus).toBe("closed_recovered")
    for (const call of p.warrantyClaim.update.mock.calls) {
      expect(call[0].data).not.toHaveProperty("status")
    }
    await expect(
      transitionSupplierClaim({ claimId: 1, to: "sent", actorUserId: 7 }, prisma as never),
    ).rejects.toThrow("tidak diizinkan")
  })

  it("FALSIFIKASI returned sebelum retur diproses → ditolak; rejected wajib alasan; lepas sesudah sent → ditolak", async () => {
    seedLink({ ...baseClaim, supplierClaimStatus: "accepted", purchaseReturnId: 9, supplierClaimBy: 7 })
    p.purchaseReturn.findUnique.mockResolvedValue({ status: "draft" })
    await expect(
      transitionSupplierClaim({ claimId: 1, to: "returned", actorUserId: 7 }, prisma as never),
    ).rejects.toThrow("belum diproses")
    seedLink({ ...baseClaim, supplierClaimStatus: "sent", supplierClaimBy: 7 })
    await expect(
      transitionSupplierClaim({ claimId: 1, to: "rejected_supplier", actorUserId: 7 }, prisma as never),
    ).rejects.toThrow("Alasan penolakan")
    await expect(
      transitionSupplierClaim(
        { claimId: 1, to: "none", actorUserId: 7, supplierClaimNotes: "salah taut" },
        prisma as never,
      ),
    ).rejects.toThrow("tidak diizinkan")
  })

  it("lepas tautan dari drafted: purchaseReturnId dibersihkan, alasan wajib", async () => {
    seedLink({ ...baseClaim, supplierClaimStatus: "drafted", purchaseReturnId: 9, supplierClaimBy: 7 })
    const unlinked = (await transitionSupplierClaim(
      { claimId: 1, to: "none", actorUserId: 7, supplierClaimNotes: "Retur salah dokumen" },
      prisma as never,
    )) as unknown as { supplierClaimStatus: string; purchaseReturnId: null }
    expect(unlinked.supplierClaimStatus).toBe("none")
    expect(unlinked.purchaseReturnId).toBeNull()
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
