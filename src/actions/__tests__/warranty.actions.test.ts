import { describe, it, expect, vi, beforeEach } from "vitest"

// F-2026-10-21-021 tahap 2: gerbang action klaim garansi. Service memegang
// state machine; test ini mengunci izin per aksi + penolakan bentuk input
// SEBELUM service/DB disentuh, dan penerusan argumen yang benar ke service.

const mocks = vi.hoisted(() => ({
  requirePermissionMock: vi.fn(),
  createWarrantyClaimMock: vi.fn(),
  decideWarrantyClaimMock: vi.fn(),
  transitionWarrantyClaimMock: vi.fn(),
  warrantyClaimFindUnique: vi.fn(),
  warrantyCoverageFindMany: vi.fn(),
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermissionMock(...a),
}))
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    warrantyClaim: { findUnique: mocks.warrantyClaimFindUnique },
    warrantyCoverage: { findMany: mocks.warrantyCoverageFindMany },
  },
}))
vi.mock("@/lib/services/warranty.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/warranty.service")>()
  return {
    ...actual,
    createWarrantyClaim: (...a: unknown[]) => mocks.createWarrantyClaimMock(...a),
    decideWarrantyClaim: (...a: unknown[]) => mocks.decideWarrantyClaimMock(...a),
    transitionWarrantyClaim: (...a: unknown[]) => mocks.transitionWarrantyClaimMock(...a),
  }
})
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

import {
  createWarrantyClaimAction,
  decideWarrantyClaimAction,
  transitionWarrantyClaimAction,
  getWarrantyClaimDetail,
} from "../warranty.actions"

function fd(payload: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(payload)) f.set(k, v)
  return f
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermissionMock.mockResolvedValue({ id: 7 })
})

describe("createWarrantyClaimAction", () => {
  it("wajib izin create_warranty_claims dan teruskan createdBy pejabat login", async () => {
    mocks.createWarrantyClaimMock.mockResolvedValue({ id: 11 })
    const res = await createWarrantyClaimAction(fd({ coverageId: "3", complaint: "Shock bocor" }))
    expect(res.success).toBe(true)
    expect(mocks.requirePermissionMock).toHaveBeenCalledWith("create_warranty_claims")
    expect(mocks.createWarrantyClaimMock).toHaveBeenCalledWith(
      expect.objectContaining({ coverageId: 3, complaint: "Shock bocor", createdBy: 7 }),
    )
  })

  it("keluhan kosong ditolak schema sebelum service dipanggil", async () => {
    const res = await createWarrantyClaimAction(fd({ coverageId: "3", complaint: "  " }))
    expect(res.success).toBe(false)
    expect(mocks.createWarrantyClaimMock).not.toHaveBeenCalled()
  })
})

describe("decideWarrantyClaimAction", () => {
  it("wajib izin approve_warranty_claims (terpisah dari edit) dan catat decisionBy", async () => {
    mocks.decideWarrantyClaimMock.mockResolvedValue({ id: 5 })
    const res = await decideWarrantyClaimAction(
      fd({ claimId: "5", decision: "approved", resolutionType: "repair" }),
    )
    expect(res.success).toBe(true)
    expect(mocks.requirePermissionMock).toHaveBeenCalledWith("approve_warranty_claims")
    expect(mocks.decideWarrantyClaimMock).toHaveBeenCalledWith(
      expect.objectContaining({ claimId: 5, decision: "approved", resolutionType: "repair", decisionBy: 7 }),
    )
  })
})

describe("transitionWarrantyClaimAction", () => {
  it("transisi approved lewat jalur transisi ditolak schema (wajib jalur keputusan)", async () => {
    const res = await transitionWarrantyClaimAction(fd({ claimId: "5", to: "approved" }))
    expect(res.success).toBe(false)
    expect(mocks.transitionWarrantyClaimMock).not.toHaveBeenCalled()
  })

  it("transisi eligibility diteruskan dengan izin edit_warranty_claims", async () => {
    mocks.transitionWarrantyClaimMock.mockResolvedValue({ id: 5 })
    const res = await transitionWarrantyClaimAction(fd({ claimId: "5", to: "eligibility" }))
    expect(res.success).toBe(true)
    expect(mocks.requirePermissionMock).toHaveBeenCalledWith("edit_warranty_claims")
  })
})

describe("getWarrantyClaimDetail", () => {
  it("klaim tidak ditemukan menghasilkan error jujur, bukan eligibility karangan", async () => {
    mocks.warrantyClaimFindUnique.mockResolvedValue(null)
    const res = await getWarrantyClaimDetail(999)
    expect(res.success).toBe(false)
  })

  it("fakta eligibility dihitung dari coverage klaim (di luar masa = withinPeriod false)", async () => {
    mocks.warrantyClaimFindUnique.mockResolvedValue({
      id: 5,
      reportedAt: new Date("2027-01-01T00:00:00Z"),
      odometerKm: null,
      coverage: {
        status: "active",
        expiresAt: new Date("2026-06-01T00:00:00Z"),
        mileageLimitKm: null,
        serialNumber: null,
      },
      customerVehicle: { id: 2, plateNumber: "B 1 AA", lastOdometerKm: null },
    })
    const res = await getWarrantyClaimDetail(5)
    expect(res.success).toBe(true)
    if (res.success) expect(res.eligibility?.withinPeriod).toBe(false)
  })
})
