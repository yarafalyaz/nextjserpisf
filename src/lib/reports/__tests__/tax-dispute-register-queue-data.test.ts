import { describe, it, expect, vi, beforeEach } from "vitest"
import { getTaxDisputeRegisterQueue } from "../tax-dispute-register-queue-data"

const mocks = vi.hoisted(() => ({
  taxAssessmentFindMany: vi.fn(),
  requirePermission: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: { taxAssessment: { findMany: (...a: unknown[]) => mocks.taxAssessmentFindMany(...a) } },
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermission(...a),
}))

const SENT = new Date("2026-01-15T00:00:00+07:00")

function row(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    slug: "skp-1",
    assessmentNumber: "00001/206/2026",
    kind: "SKPKB",
    taxKind: "ppn",
    assessedAmount: { toString: () => "100" },
    disputedAmount: { toString: () => "60" },
    paidUnderProtest: { toString: () => "60" },
    sentAt: SENT,
    status: "DIPROSES",
    deletedAt: null,
    steps: [
      {
        id: 1,
        kind: "KEBERATAN",
        article36Subkind: null,
        status: "DIAJUKAN",
        filedAt: SENT,
        decidedAt: null,
        decidedAmount: null,
        lateReason: null,
      },
    ],
    ...over,
  }
}

describe("getTaxDisputeRegisterQueue (loader fail-closed, AC-TXD-B5)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue({ id: "1" })
    mocks.taxAssessmentFindMany.mockResolvedValue([row()])
  })

  it("tanpa izin view_tax_disputes menolak SEBELUM query (nominal tak bocor)", async () => {
    mocks.requirePermission.mockRejectedValueOnce(new Error("Tidak memiliki izin"))
    await expect(getTaxDisputeRegisterQueue()).rejects.toThrow("Tidak memiliki izin")
    expect(mocks.requirePermission).toHaveBeenCalledWith("view_tax_disputes")
    expect(mocks.taxAssessmentFindMany).not.toHaveBeenCalled()
  })

  it("FALSIFIKASI B5: izin lain (view_tax_payments) bukan izin register = MERAH", async () => {
    await getTaxDisputeRegisterQueue()
    expect(mocks.requirePermission).toHaveBeenCalledWith("view_tax_disputes")
    expect(mocks.requirePermission).not.toHaveBeenCalledWith("view_tax_payments")
  })

  it("populasi deletedAt:null; select tanpa kolom sensitif liar", async () => {
    await getTaxDisputeRegisterQueue()
    const arg = mocks.taxAssessmentFindMany.mock.calls[0][0]
    expect(arg.where).toEqual({ deletedAt: null })
    expect(Object.keys(arg.select)).toEqual(
      expect.arrayContaining(["disputedAmount", "paidUnderProtest", "steps"]),
    )
  })

  it("baca-saja: hanya findMany; tenggat dari sentAt (basis kirim)", async () => {
    const q = await getTaxDisputeRegisterQueue()
    expect(q.title).toBe("Register Ketetapan Pajak")
    expect(q.rows).toHaveLength(1)
    expect(q.rows[0].remainingDisputed).toBe(60)
    // sentAt 15 Jan 2026 + 3 bulan kalender = 15 Apr 2026 23:59:59 WIB.
    const dl = q.rows[0].nearestDeadline
    expect(dl).not.toBeNull()
    expect([dl!.getFullYear(), dl!.getMonth(), dl!.getDate()]).toEqual([2026, 3, 15])
  })
})
