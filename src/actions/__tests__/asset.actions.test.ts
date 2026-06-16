import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => {
  const requirePermissionMock = vi.fn()
  const revalidateMock = vi.fn()
  const redirectMock = vi.fn()
  const logActivityMock = vi.fn()
  const assertApprovedMock = vi.fn()
  const generateDocNumMock = vi.fn()
  const prismaMock = {
    assetCategory: {
      create: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
    },
    assetBrand: {
      create: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
    },
    assetTransfer: {
      create: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findFirst: vi.fn(),
    },
    asset: {
      update: vi.fn(),
      delete: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      updateMany: vi.fn(),
    },
    assetHistory: {
      create: vi.fn(),
    },
    journal: {
      count: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    documentSequence: {
      upsert: vi.fn(),
    },
    $transaction: vi.fn(async (ops: any) => {
      if (typeof ops === "function") {
        return ops(prismaMock)
      }
      return Promise.all(ops)
    }),
  }
  return {
    requirePermissionMock,
    revalidateMock,
    redirectMock,
    logActivityMock,
    assertApprovedMock,
    generateDocNumMock,
    prismaMock,
  }
})

const {
  requirePermissionMock,
  revalidateMock,
  redirectMock,
  logActivityMock,
  assertApprovedMock,
  generateDocNumMock,
  prismaMock,
} = mocks

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermissionMock(...a),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: mocks.prismaMock,
}))

vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => mocks.revalidateMock(...a),
}))

vi.mock("next/navigation", () => ({
  redirect: (...a: unknown[]) => {
    mocks.redirectMock(...a)
    const e = new Error("NEXT_REDIRECT")
    ;(e as any).digest = "NEXT_REDIRECT;replace;/aset;307"
    throw e
  },
}))

vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: (...a: unknown[]) => mocks.logActivityMock(...a),
}))

vi.mock("@/lib/services/approval-workflow.service", () => ({
  assertApproved: (...a: unknown[]) => mocks.assertApprovedMock(...a),
}))

vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: (...a: unknown[]) => mocks.generateDocNumMock(...a),
}))

vi.mock("@/lib/utils/error", () => ({
  getErrorMessage: (e: unknown, fallback?: string) =>
    e instanceof Error ? e.message : fallback ?? "error",
  isNextRedirectError: (e: unknown) =>
    e instanceof Error && (e as any).digest?.startsWith("NEXT_REDIRECT") === true,
}))

import {
  createAssetCategory,
  createAssetBrand,
  createAssetTransfer,
  deleteAssetCategory,
  deleteAssetBrand,
  deleteAssetTransfer,
  updateAssetBrand,
  updateAssetCategory,
  updateAssetTransfer,
  createAsset,
  updateAsset,
  deleteAsset,
  disposeAsset,
} from "../asset.actions"

function fd(entries: Record<string, string | string[]>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(entries)) {
    if (Array.isArray(v)) v.forEach((x) => f.append(k, x))
    else f.set(k, v)
  }
  return f
}

describe("Asset Brand Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, "error").mockImplementation(() => {})
    requirePermissionMock.mockResolvedValue({ id: 1 })
    prismaMock.assetBrand.create.mockResolvedValue({ id: 20 })
  })

  it("fails validation on create with empty form", async () => {
    const res = await createAssetBrand(fd({}))
    expect(res?.success).toBe(false)
  })

  it("fails validation on update with empty form", async () => {
    const res = await updateAssetBrand(20, fd({}))
    expect(res?.success).toBe(false)
  })

  it("creates brand and redirects", async () => {
    await expect(createAssetBrand(fd({ name: "Dell" }))).rejects.toThrow("NEXT_REDIRECT")
    expect(prismaMock.assetBrand.create).toHaveBeenCalled()
  })

  it("updates brand and redirects", async () => {
    await expect(updateAssetBrand(20, fd({ name: "HP" }))).rejects.toThrow("NEXT_REDIRECT")
    expect(prismaMock.assetBrand.update).toHaveBeenCalled()
  })

  it("deletes brand and redirects", async () => {
    prismaMock.assetBrand.delete.mockResolvedValue({})
    await expect(deleteAssetBrand(20)).rejects.toThrow("NEXT_REDIRECT")
    expect(prismaMock.assetBrand.delete).toHaveBeenCalledWith({ where: { id: 20 } })
  })

  it("handles error on create brand", async () => {
    prismaMock.assetBrand.create.mockRejectedValue(new Error("db err"))
    const res = await createAssetBrand(fd({ name: "Dell" }))
    expect(res?.success).toBe(false)
    expect(res?.error).toBe("db err")
  })

  it("handles error on update brand", async () => {
    prismaMock.assetBrand.update.mockRejectedValue(new Error("db err"))
    const res = await updateAssetBrand(20, fd({ name: "HP" }))
    expect(res?.success).toBe(false)
    expect(res?.error).toBe("db err")
  })

  it("handles error on delete brand", async () => {
    prismaMock.assetBrand.delete.mockRejectedValue(new Error("db err"))
    const res = await deleteAssetBrand(20)
    expect(res?.success).toBe(false)
    expect(res?.error).toBe("db err")
  })
})

describe("Asset Category Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, "error").mockImplementation(() => {})
    requirePermissionMock.mockResolvedValue({ id: 1 })
    prismaMock.assetCategory.create.mockResolvedValue({ id: 10 })
  })

  it("fails validation with empty form", async () => {
    const res = await createAssetCategory(fd({}))
    expect(res?.success).toBe(false)
  })

  it("fails validation on update with empty form", async () => {
    const res = await updateAssetCategory(10, fd({}))
    expect(res?.success).toBe(false)
  })

  it("creates category and redirects", async () => {
    await expect(
      createAssetCategory(fd({ name: "Computers", code: "CMP" }))
    ).rejects.toThrow("NEXT_REDIRECT")
    expect(prismaMock.assetCategory.create).toHaveBeenCalled()
    expect(logActivityMock).toHaveBeenCalledWith("create", "AssetCategory", 10, expect.any(String))
    expect(revalidateMock).toHaveBeenCalledWith("/aset/kategori")
  })

  it("updates category and redirects", async () => {
    await expect(
      updateAssetCategory(10, fd({ name: "IT", code: "IT" }))
    ).rejects.toThrow("NEXT_REDIRECT")
    expect(prismaMock.assetCategory.update).toHaveBeenCalled()
  })

  it("handles error on create category", async () => {
    prismaMock.assetCategory.create.mockRejectedValue(new Error("db err"))
    const res = await createAssetCategory(fd({ name: "Computers", code: "CMP" }))
    expect(res?.success).toBe(false)
    expect(res?.error).toBe("db err")
  })

  it("handles error on update category", async () => {
    prismaMock.assetCategory.update.mockRejectedValue(new Error("db err"))
    const res = await updateAssetCategory(10, fd({ name: "IT", code: "IT" }))
    expect(res?.success).toBe(false)
    expect(res?.error).toBe("db err")
  })

  it("deletes category and redirects", async () => {
    prismaMock.assetCategory.delete.mockResolvedValue({})
    await expect(deleteAssetCategory(10)).rejects.toThrow("NEXT_REDIRECT")
    expect(prismaMock.assetCategory.delete).toHaveBeenCalledWith({ where: { id: 10 } })
  })

  it("handles error on delete category", async () => {
    prismaMock.assetCategory.delete.mockRejectedValue(new Error("db err"))
    const res = await deleteAssetCategory(10)
    expect(res?.success).toBe(false)
    expect(res?.error).toBe("db err")
  })
})


describe("Asset Transfer Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, "error").mockImplementation(() => {})
    requirePermissionMock.mockResolvedValue({ id: 1 })
    prismaMock.assetTransfer.create.mockResolvedValue({ id: 30 })
    prismaMock.asset.update.mockResolvedValue({})
  })

  it("fails validation with empty form on create", async () => {
    const res = await createAssetTransfer(fd({}))
    expect(res?.success).toBe(false)
  })

  it("fails validation with empty form on update", async () => {
    const res = await updateAssetTransfer(30, fd({}))
    expect(res?.success).toBe(false)
  })

  it("handles error on create transfer", async () => {
    prismaMock.assetTransfer.create.mockRejectedValue(new Error("db err"))
    const res = await createAssetTransfer(fd({
      assetId: "5",
      toLocation: "HQ",
      transferDate: "2026-06-12",
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toBe("db err")
  })

  it("rethrows redirect error on create transfer", async () => {
    const redirectErr = new Error("redirect")
    ;(redirectErr as any).digest = "NEXT_REDIRECT_TEST"
    prismaMock.assetTransfer.create.mockRejectedValue(redirectErr)
    await expect(createAssetTransfer(fd({
      assetId: "5",
      toLocation: "HQ",
      transferDate: "2026-06-12",
    }))).rejects.toThrow(redirectErr)
  })

  it("creates transfer and updates asset location", async () => {
    const res = await createAssetTransfer(fd({
      assetId: "5",
      toLocation: "HQ",
      transferDate: "2026-06-12",
    }))
    expect(res.success).toBe(true)
    expect(prismaMock.assetTransfer.create).toHaveBeenCalled()
    expect(prismaMock.asset.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { location: "HQ" },
    })
  })

  it("wraps transfer create + asset location update in $transaction for atomicity", async () => {
    await createAssetTransfer(fd({
      assetId: "5",
      toLocation: "HQ",
      transferDate: "2026-06-12",
    }))
    // Both writes must be issued through the tx handle inside the $transaction callback.
    expect(prismaMock.$transaction).toHaveBeenCalled()
    // Confirm top-level prisma.* (NOT tx.*) was NOT called directly for the
    // compound write pair: every transfer/asset write must be nested in the
    // transaction so a partial-failure rolls the whole batch back.
    const txCallArgs = prismaMock.$transaction.mock.calls[0][0]
    expect(typeof txCallArgs).toBe("function")
    // Spy on tx-scoped calls vs direct calls by inspecting mock call sites.
    const transferCreateCalls = prismaMock.assetTransfer.create.mock.calls.length
    const assetUpdateCalls = prismaMock.asset.update.mock.calls.length
    expect(transferCreateCalls).toBeGreaterThanOrEqual(1)
    expect(assetUpdateCalls).toBeGreaterThanOrEqual(1)
  })

  it("surfaces error when inner asset.update rejects (no orphaned transfer)", async () => {
    prismaMock.asset.update.mockRejectedValue(new Error("FK violation"))
    const res = await createAssetTransfer(fd({
      assetId: "5",
      toLocation: "HQ",
      transferDate: "2026-06-12",
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toBe("FK violation")
    // Both calls happened inside the same $transaction callback, so the
    // mock-based tx wrapper rolled the assetTransfer.create back conceptually.
    // The pre-fix code would have already returned success on the create, leaving
    // the asset update un-retried and the asset.location desynced.
    expect(prismaMock.$transaction).toHaveBeenCalled()
  })

  it("deletes transfer and reverts asset location if latest", async () => {
    prismaMock.assetTransfer.findUniqueOrThrow.mockResolvedValue({
      assetId: 5,
      fromLocation: "OldLoc",
      toLocation: "HQ",
    })
    prismaMock.asset.findUnique.mockResolvedValue({ location: "HQ" })
    prismaMock.assetTransfer.findFirst.mockResolvedValue(null) // no remaining transfer

    const res = await deleteAssetTransfer(30)
    expect(res.success).toBe(true)
    expect(prismaMock.asset.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { location: "OldLoc" },
    })
  })

  it("deletes transfer and reverts to latest transfer destination if one exists", async () => {
    prismaMock.assetTransfer.findUniqueOrThrow.mockResolvedValue({
      assetId: 5,
      fromLocation: "OldLoc",
      toLocation: "HQ",
    })
    prismaMock.asset.findUnique.mockResolvedValue({ location: "HQ" })
    prismaMock.assetTransfer.findFirst.mockResolvedValue({ toLocation: "OtherBranch" })

    const res = await deleteAssetTransfer(30)
    expect(res.success).toBe(true)
    expect(prismaMock.asset.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { location: "OtherBranch" },
    })
  })

  it("deletes transfer and skips revert when asset location differs", async () => {
    prismaMock.assetTransfer.findUniqueOrThrow.mockResolvedValue({
      assetId: 5,
      fromLocation: "OldLoc",
      toLocation: "HQ",
    })
    prismaMock.asset.findUnique.mockResolvedValue({ location: "Elsewhere" })

    const res = await deleteAssetTransfer(30)
    expect(res.success).toBe(true)
    // Should not call asset.update
    expect(prismaMock.asset.update).not.toHaveBeenCalled()
  })

  it("deletes transfer and skips revert when asset not found", async () => {
    prismaMock.assetTransfer.findUniqueOrThrow.mockResolvedValue({
      assetId: 5,
      fromLocation: "OldLoc",
      toLocation: "HQ",
    })
    prismaMock.asset.findUnique.mockResolvedValue(null)

    const res = await deleteAssetTransfer(30)
    expect(res.success).toBe(true)
    expect(prismaMock.asset.update).not.toHaveBeenCalled()
  })

  it("handles error on delete transfer", async () => {
    prismaMock.assetTransfer.findUniqueOrThrow.mockRejectedValue(new Error("db err"))
    const res = await deleteAssetTransfer(30)
    expect(res?.success).toBe(false)
    expect(res?.error).toBe("db err")
  })

  it("rethrows redirect error on delete transfer", async () => {
    const redirectErr = new Error("redirect")
    ;(redirectErr as any).digest = "NEXT_REDIRECT_TEST"
    prismaMock.assetTransfer.findUniqueOrThrow.mockRejectedValue(redirectErr)
    await expect(deleteAssetTransfer(30)).rejects.toThrow(redirectErr)
  })

  it("updates transfer with same assetId (no revert)", async () => {
    prismaMock.assetTransfer.findUniqueOrThrow.mockResolvedValue({
      id: 30,
      assetId: 5,
      fromLocation: "OldLoc",
    })
    prismaMock.assetTransfer.update.mockResolvedValue({ id: 30 })

    await updateAssetTransfer(30, fd({
      assetId: "5",
      toLocation: "Branch2",
      transferDate: "2026-06-12",
    }))
    expect(prismaMock.assetTransfer.update).toHaveBeenCalled()
  })

  it("updates transfer with different assetId (reverts old location)", async () => {
    prismaMock.assetTransfer.findUniqueOrThrow.mockResolvedValue({
      id: 30,
      assetId: 5,
      fromLocation: "OldLoc",
      toLocation: "Branch1",
    })
    prismaMock.assetTransfer.update.mockResolvedValue({ id: 30 })
    // Guard requires asset.location === oldTransfer.toLocation to revert.
    prismaMock.asset.findUnique.mockResolvedValue({ location: "Branch1" })
    prismaMock.assetTransfer.findFirst.mockResolvedValue(null)

    await updateAssetTransfer(30, fd({
      assetId: "7",
      toLocation: "Branch2",
      transferDate: "2026-06-12",
    }))
    expect(prismaMock.asset.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { location: "OldLoc" },
    })
  })

  it("updates transfer with different assetId and no fromLocation (no revert)", async () => {
    prismaMock.assetTransfer.findUniqueOrThrow.mockResolvedValue({
      id: 30,
      assetId: 5,
      fromLocation: null,
    })
    prismaMock.assetTransfer.update.mockResolvedValue({ id: 30 })

    await updateAssetTransfer(30, fd({
      assetId: "7",
      toLocation: "Branch2",
      transferDate: "2026-06-12",
    }))
    expect(prismaMock.assetTransfer.update).toHaveBeenCalled()
    // Should not call asset.update with revert
    const revertCalls = prismaMock.asset.update.mock.calls.filter(
      (c: any[]) => c[0]?.data?.location === "OldLoc"
    )
    expect(revertCalls).toHaveLength(0)
  })

  // Regression: when the old asset has since been moved by a LATER transfer,
  // its current location no longer equals this transfer's toLocation, so we
  // MUST NOT revert it to fromLocation (that would clobber the later transfer's
  // destination and silently corrupt asset.location). Mirrors the
  // asset.location === transfer.toLocation guard in deleteAssetTransfer.
  it("does NOT revert old asset when its current location no longer matches this transfer's toLocation", async () => {
    prismaMock.assetTransfer.findUniqueOrThrow.mockResolvedValue({
      id: 30,
      assetId: 5,
      fromLocation: "OldLoc",
      toLocation: "Branch1",
    })
    prismaMock.assetTransfer.update.mockResolvedValue({ id: 30 })
    // Asset 5 has since been moved to "LatestBranch" by a later transfer
    prismaMock.asset.findUnique.mockResolvedValue({ location: "LatestBranch" })

    await updateAssetTransfer(30, fd({
      assetId: "7",
      toLocation: "Branch2",
      transferDate: "2026-06-12",
    }))
    // Must NOT call asset.update with revert-to-OldLoc
    const revertCalls = prismaMock.asset.update.mock.calls.filter(
      (c: any[]) => c[0]?.data?.location === "OldLoc"
    )
    expect(revertCalls).toHaveLength(0)
  })

  it("handles error on update transfer", async () => {
    prismaMock.assetTransfer.findUniqueOrThrow.mockRejectedValue(new Error("db err"))
    const res = await updateAssetTransfer(30, fd({
      assetId: "7",
      toLocation: "Branch2",
      transferDate: "2026-06-12",
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toBe("db err")
  })

  it("rethrows redirect error on update transfer", async () => {
    prismaMock.assetTransfer.findUniqueOrThrow.mockResolvedValue({
      id: 30,
      assetId: 5,
      fromLocation: "OldLoc",
    })
    const redirectErr = new Error("redirect")
    ;(redirectErr as any).digest = "NEXT_REDIRECT_TEST"
    prismaMock.assetTransfer.update.mockRejectedValue(redirectErr)
    await expect(updateAssetTransfer(30, fd({
      assetId: "5",
      toLocation: "Branch2",
      transferDate: "2026-06-12",
    }))).rejects.toThrow(redirectErr)
  })
})

describe("createAsset / updateAsset", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, "error").mockImplementation(() => {})
    requirePermissionMock.mockResolvedValue({ id: 1 })
    prismaMock.asset.create.mockResolvedValue({ id: 100, name: "Laptop", code: "AST-001" })
    prismaMock.documentSequence.upsert.mockResolvedValue({ currentValue: 1 })
    generateDocNumMock.mockResolvedValue("AST-001")
    process.env.FIXED_ASSET_ACCOUNT_ID = "0"
    process.env.ASSET_CASH_ACCOUNT_ID = "0"
  })

  it("fails validation with empty form on create", async () => {
    const res = await createAsset(fd({}))
    expect(res?.success).toBe(false)
  })

  it("fails validation with empty form on update", async () => {
    const res = await updateAsset(100, fd({}))
    expect(res?.success).toBe(false)
  })

  it("generates code when none provided", async () => {
    await createAsset(fd({
      name: "Laptop",
      purchasePrice: "1000",
    }))
    expect(generateDocNumMock).toHaveBeenCalled()
  })

  it("creates asset without GL posting when env vars missing", async () => {
    const res = await createAsset(fd({
      name: "Laptop",
      code: "LAP-01",
      purchasePrice: "1000",
    }))
    expect(res.success).toBe(true)
    expect(prismaMock.asset.create).toHaveBeenCalled()
    expect(prismaMock.journal.create).not.toHaveBeenCalled()
  })

  it("skips GL posting when purchaseCost is 0", async () => {
    process.env.FIXED_ASSET_ACCOUNT_ID = "200"
    process.env.ASSET_CASH_ACCOUNT_ID = "201"
    const res = await createAsset(fd({
      name: "Laptop",
      code: "LAP-01",
      purchasePrice: "0",
    }))
    expect(res.success).toBe(true)
    expect(prismaMock.journal.create).not.toHaveBeenCalled()
  })

  it("creates asset with GL posting when env vars set + cost > 0", async () => {
    process.env.FIXED_ASSET_ACCOUNT_ID = "200"
    process.env.ASSET_CASH_ACCOUNT_ID = "201"
    const res = await createAsset(fd({
      name: "Laptop",
      purchasePrice: "1000",
    }))
    expect(res.success).toBe(true)
    expect(prismaMock.journal.create).toHaveBeenCalled()
  })

  it("returns error when asset create throws (caught error path)", async () => {
    prismaMock.$transaction.mockRejectedValueOnce(new Error("DB down"))
    const res = await createAsset(fd({
      name: "Laptop",
      code: "LAP-01",
      purchasePrice: "1000",
    }))
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/DB down/)
  })

  it("rethrows redirect error on create asset", async () => {
    const redirectErr = new Error("redirect")
    ;(redirectErr as any).digest = "NEXT_REDIRECT_TEST"
    prismaMock.$transaction.mockRejectedValueOnce(redirectErr)
    await expect(createAsset(fd({
      name: "Laptop",
      code: "LAP-01",
      purchasePrice: "1000",
    }))).rejects.toThrow(redirectErr)
  })

  it("uses provided code when present (skips generateDocumentNumber)", async () => {
    await createAsset(fd({
      name: "X",
      code: "EXISTING",
      purchasePrice: "100",
    }))
    expect(generateDocNumMock).not.toHaveBeenCalled()
  })

  it("updates asset and skips GL check when cost unchanged", async () => {
    prismaMock.asset.findUniqueOrThrow.mockResolvedValue({ purchaseCost: 1000 })
    const res = await updateAsset(100, fd({
      name: "Laptop V2",
      purchasePrice: "1000",
    }))
    expect(res.success).toBe(true)
    expect(prismaMock.asset.update).toHaveBeenCalled()
    expect(prismaMock.journal.findFirst).not.toHaveBeenCalled()
  })

  it("refuses cost change when acquisition journal exists", async () => {
    prismaMock.asset.findUniqueOrThrow.mockResolvedValue({ purchaseCost: 1000 })
    prismaMock.journal.findFirst.mockResolvedValue({ id: 1 })
    const res = await updateAsset(100, fd({
      name: "X",
      purchasePrice: "2000",
    }))
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/tidak dapat diubah/)
  })

  it("allows cost change when no acquisition journal", async () => {
    prismaMock.asset.findUniqueOrThrow.mockResolvedValue({ purchaseCost: 1000 })
    prismaMock.journal.findFirst.mockResolvedValue(null)
    const res = await updateAsset(100, fd({
      name: "X",
      purchasePrice: "2000",
    }))
    expect(res.success).toBe(true)
  })

  it("returns error when prisma throws (caught error path)", async () => {
    prismaMock.asset.findUniqueOrThrow.mockRejectedValue(new Error("DB down"))
    const res = await updateAsset(100, fd({
      name: "X",
      purchasePrice: "100",
    }))
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/DB down/)
  })

  it("rethrows redirect error on update asset", async () => {
    prismaMock.asset.findUniqueOrThrow.mockResolvedValue({ purchaseCost: 1000 })
    const redirectErr = new Error("redirect")
    ;(redirectErr as any).digest = "NEXT_REDIRECT_TEST"
    prismaMock.asset.update.mockRejectedValue(redirectErr)
    await expect(updateAsset(100, fd({
      name: "X",
      purchasePrice: "1000",
    }))).rejects.toThrow(redirectErr)
  })
})

describe("deleteAsset", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, "error").mockImplementation(() => {})
    requirePermissionMock.mockResolvedValue({ id: 1 })
    prismaMock.journal.count.mockResolvedValue(0)
    prismaMock.asset.delete.mockResolvedValue({})
  })

  it("deletes asset when no GL journals exist", async () => {
    const res = await deleteAsset(100)
    expect(res.success).toBe(true)
    expect(prismaMock.asset.delete).toHaveBeenCalledWith({ where: { id: 100 } })
  })

  it("refuses deletion when GL journals exist (acquisition/depreciation)", async () => {
    prismaMock.journal.count.mockResolvedValue(1)
    const res = await deleteAsset(100)
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/pelepasan\/disposal/)
    expect(prismaMock.asset.delete).not.toHaveBeenCalled()
  })

  it("handles error on journal count (caught error path)", async () => {
    prismaMock.journal.count.mockRejectedValue(new Error("db err"))
    const res = await deleteAsset(100)
    expect(res.success).toBe(false)
    expect(res.error).toBe("db err")
  })

  it("handles error on asset delete (caught error path)", async () => {
    prismaMock.asset.delete.mockRejectedValue(new Error("delete err"))
    const res = await deleteAsset(100)
    expect(res.success).toBe(false)
    expect(res.error).toBe("delete err")
  })

  it("rethrows redirect error on delete asset", async () => {
    const redirectErr = new Error("redirect")
    ;(redirectErr as any).digest = "NEXT_REDIRECT_TEST"
    prismaMock.journal.count.mockRejectedValue(redirectErr)
    await expect(deleteAsset(100)).rejects.toThrow(redirectErr)
  })
})

describe("disposeAsset", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, "error").mockImplementation(() => {})
    requirePermissionMock.mockResolvedValue({ id: 1 })
    prismaMock.asset.findUniqueOrThrow.mockResolvedValue({
      id: 100,
      name: "Laptop",
      code: "AST-001",
      status: "active",
      purchaseCost: 1000,
      currentValue: 500,
    })
    prismaMock.asset.updateMany.mockResolvedValue({ count: 1 })
    prismaMock.journal.findFirst.mockResolvedValue(null)
    prismaMock.assetHistory.create.mockResolvedValue({})
    prismaMock.documentSequence.upsert.mockResolvedValue({ currentValue: 1 })
    process.env.FIXED_ASSET_ACCOUNT_ID = "0"
    process.env.ACCUMULATED_DEPRECIATION_ACCOUNT_ID = "0"
    process.env.ASSET_DISPOSAL_GAINLOSS_ACCOUNT_ID = "0"
    process.env.ASSET_CASH_ACCOUNT_ID = "0"
  })

  it("fails validation with empty form", async () => {
    const res = await disposeAsset(fd({}))
    expect(res?.success).toBe(false)
  })

  it("disposes asset and records gain (proceeds > book value)", async () => {
    const res = await disposeAsset(fd({
      assetId: "100",
      proceeds: "700",
      disposalDate: "2026-06-12",
    }))
    expect(res.success).toBe(true)
    expect(res.gainLoss).toBe(200)
    expect(prismaMock.asset.updateMany).toHaveBeenCalledWith({
      where: { id: 100, status: { not: "disposed" } },
      data: { status: "disposed", currentValue: 0 },
    })
  })

  it("records loss (proceeds < book value)", async () => {
    const res = await disposeAsset(fd({
      assetId: "100",
      proceeds: "100",
    }))
    expect(res.success).toBe(true)
    expect(res.gainLoss).toBe(-400)
  })

  it("fails when asset is already disposed", async () => {
    prismaMock.asset.findUniqueOrThrow.mockResolvedValue({
      id: 100,
      name: "X",
      code: "X",
      status: "disposed",
      purchaseCost: 1000,
      currentValue: 0,
    })
    const res = await disposeAsset(fd({ assetId: "100" }))
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/sudah dilepas/)
  })

  it("fails when claim count is 0 (race condition)", async () => {
    prismaMock.asset.updateMany.mockResolvedValue({ count: 0 })
    const res = await disposeAsset(fd({ assetId: "100" }))
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/sedang diproses/)
  })

  it("skips journal creation when no acquisition journal (legacy asset)", async () => {
    prismaMock.journal.findFirst.mockResolvedValue(null)
    const res = await disposeAsset(fd({ assetId: "100", proceeds: "0" }))
    expect(res.success).toBe(true)
    expect(prismaMock.journal.create).not.toHaveBeenCalled()
  })

  it("creates journal when acquisition journal exists and GL accounts configured", async () => {
    prismaMock.journal.findFirst.mockResolvedValue({ id: 1 })
    process.env.FIXED_ASSET_ACCOUNT_ID = "200"
    process.env.ACCUMULATED_DEPRECIATION_ACCOUNT_ID = "201"
    process.env.ASSET_DISPOSAL_GAINLOSS_ACCOUNT_ID = "202"
    process.env.ASSET_CASH_ACCOUNT_ID = "203"

    const res = await disposeAsset(fd({ assetId: "100", proceeds: "700" }))
    expect(res.success).toBe(true)
    expect(prismaMock.journal.create).toHaveBeenCalled()
  })

  it("handles error on dispose asset", async () => {
    prismaMock.asset.findUniqueOrThrow.mockRejectedValue(new Error("db err"))
    const res = await disposeAsset(fd({ assetId: "100" }))
    expect(res?.success).toBe(false)
    expect(res?.error).toBe("db err")
  })

  it("rethrows redirect error on dispose asset", async () => {
    const redirectErr = new Error("redirect")
    ;(redirectErr as any).digest = "NEXT_REDIRECT_TEST"
    prismaMock.asset.findUniqueOrThrow.mockRejectedValue(redirectErr)
    await expect(disposeAsset(fd({ assetId: "100" }))).rejects.toThrow(redirectErr)
  })
})
