import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * F-2026-10-25-035-B: wiring titik tahan Q-CL2-4 di aksi penjualan.
 * Service gerbang di-mock di batasnya; tes ini mengunci PERILAKU wiring:
 * tertahan = dokumen tidak lahir, DP tertahan = rantai tidak jalan,
 * hasil idempoten DP tidak ditahan.
 */

const mocks = vi.hoisted(() => ({
  assess: vi.fn(),
  markUsed: vi.fn(async () => undefined),
  onReceived: vi.fn(async () => undefined),
  onConfirmed: vi.fn(async () => undefined),
  soCreate: vi.fn(async () => ({ id: 88, documentNo: "SO-001" })),
  soFindFirst: vi.fn(async () => null),
  dpFindUnique: vi.fn(),
  invFindFirst: vi.fn(async (): Promise<{ id: number } | null> => null),
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: vi.fn(async () => ({ id: 7 })),
}))
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
      fn({
        $queryRaw: vi.fn(async () => []),
        $executeRaw: vi.fn(async () => 0),
        salesOrder: {
          findFirst: mocks.soFindFirst,
          create: mocks.soCreate,
        },
        quotation: { findUnique: vi.fn(async () => null) },
        downPayment: { findUnique: mocks.dpFindUnique },
        salesInvoice: { findFirst: mocks.invFindFirst },
      }),
    ),
    salesOrder: { findUniqueOrThrow: vi.fn(async () => ({ documentNo: "SO-001" })) },
  },
}))
vi.mock("@/lib/utils/idempotency", () => ({
  checkIdempotency: vi.fn(async () => undefined),
}))
vi.mock("@/lib/hooks/accounting.hook", () => ({
  onSalesInvoicePosted: vi.fn(),
  onSalesPaymentCreated: vi.fn(),
  onSalesReturnCompleted: vi.fn(),
  onDownPaymentReceived: (...a: unknown[]) => mocks.onReceived(...(a as [])),
  deleteJournalByReference: vi.fn(),
  deleteJournalByReferenceTx: vi.fn(),
}))
vi.mock("@/lib/hooks/down-payment.hook", () => ({
  onDownPaymentConfirmed: (...a: unknown[]) => mocks.onConfirmed(...(a as [])),
}))
vi.mock("@/lib/hooks/sales-payment.hook", () => ({
  onSalesPaymentCreated: vi.fn(),
  onSalesPaymentUpdated: vi.fn(),
  onSalesPaymentDeleted: vi.fn(),
}))
vi.mock("@/lib/hooks/sales-return.hook", () => ({ onSalesReturnCompleted: vi.fn() }))
vi.mock("@/lib/services/notification.service", () => ({ notificationService: {} }))
vi.mock("@/lib/services/quotation-sync.service", () => ({ resyncOnEdit: vi.fn() }))
vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: vi.fn(async () => "SO-001"),
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: vi.fn(async () => undefined),
  reportPostCommitAuditFailure: vi.fn(async () => ({ auditPersisted: true })),
}))
vi.mock("@/lib/utils/slug-db", () => ({ nextSlug: vi.fn(async () => "test-slug") }))
vi.mock("@/lib/services/period-lock.service", () => ({
  assertPeriodOpen: vi.fn(async () => undefined),
}))
vi.mock("@/lib/services/credit-gate.service", () => ({
  assessCreditGateInTx: (...a: unknown[]) => mocks.assess(...a),
  assertCreditGatePassed: (outcome: { kind: string; message?: string; overrideId?: number }) => {
    if (outcome.kind === "blocked" || outcome.kind === "override_pending") {
      throw new Error(outcome.message ?? "tertahan")
    }
    if (outcome.kind === "override_used") return outcome.overrideId ?? null
    return null
  },
  markCreditOverrideUsed: (...a: unknown[]) => mocks.markUsed(...(a as [])),
}))

import { confirmDownPayment, createSalesOrder } from "../sales.actions"

function soForm(): FormData {
  const fd = new FormData()
  fd.set("customerId", "3")
  fd.set("date", "2026-10-26")
  fd.set("creditOverrideReason", "Proyek mendesak pelanggan")
  return fd
}

describe("wiring gerbang kredit di sales.actions (035-B)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.soCreate.mockResolvedValue({ id: 88, documentNo: "SO-001" })
    mocks.invFindFirst.mockResolvedValue(null)
  })

  it("AC-CL2-B1: gate_off -> SO lahir persis seperti hari ini", async () => {
    mocks.assess.mockResolvedValue({ kind: "gate_off" })
    const res = await createSalesOrder(soForm())
    expect(res.success).toBe(true)
    expect(mocks.soCreate).toHaveBeenCalledTimes(1)
  })

  it("AC-CL2-B2: override_pending -> SO TIDAK lahir, pesan tertahan", async () => {
    mocks.assess.mockResolvedValue({
      kind: "override_pending",
      overrideId: 501,
      message: "Dokumen tertahan gerbang kredit: Lewat batas. Batas kredit Rp 500.000, PaparanBersih Rp 600.000.",
    })
    const res = await createSalesOrder(soForm())
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toContain("Lewat batas")
    expect(mocks.soCreate).not.toHaveBeenCalled()
  })

  it("AC-CL2-B4: override_used -> SO lahir + override ditandai used dgn dokumen", async () => {
    mocks.assess.mockResolvedValue({ kind: "override_used", overrideId: 44 })
    const res = await createSalesOrder(soForm())
    expect(res.success).toBe(true)
    expect(mocks.markUsed).toHaveBeenCalledWith(
      expect.anything(),
      44,
      expect.objectContaining({ id: 88, documentNo: "SO-001" }),
    )
  })

  it("AC-CL2-B8 DP: tertahan di hulu -> rantai DP TIDAK jalan sama sekali", async () => {
    mocks.dpFindUnique.mockResolvedValue({
      status: "draft",
      customerId: 3,
      quotationId: 5,
      quotation: { grandTotal: 600000 },
    })
    mocks.assess.mockResolvedValue({
      kind: "blocked",
      overrideId: null,
      message: "Dokumen tertahan gerbang kredit: Lewat batas.",
    })
    const res = await confirmDownPayment(11)
    expect(res.success).toBe(false)
    expect(mocks.onReceived).not.toHaveBeenCalled()
    expect(mocks.onConfirmed).not.toHaveBeenCalled()
  })

  it("DP idempoten (sudah confirmed) -> TIDAK dinilai, rantai jalan", async () => {
    mocks.dpFindUnique.mockResolvedValue({
      status: "confirmed",
      customerId: 3,
      quotationId: 5,
      quotation: { grandTotal: 600000 },
    })
    const res = await confirmDownPayment(11)
    expect(res.success).toBe(true)
    expect(mocks.assess).not.toHaveBeenCalled()
    expect(mocks.onConfirmed).toHaveBeenCalled()
  })

  it("DP invoice existing -> TIDAK dinilai ulang, rantai jalan", async () => {
    mocks.dpFindUnique.mockResolvedValue({
      status: "draft",
      customerId: 3,
      quotationId: 5,
      quotation: { grandTotal: 600000 },
    })
    mocks.invFindFirst.mockResolvedValue({ id: 21 })
    const res = await confirmDownPayment(11)
    expect(res.success).toBe(true)
    expect(mocks.assess).not.toHaveBeenCalled()
  })
})
