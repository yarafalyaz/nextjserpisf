import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * F-2026-10-25-035-B: penilaian gerbang kredit tx-aware.
 * Mock tx manual: systemSetting saklar, customer baris, komponen K1..K5
 * kosong kecuali yang diatur tes, creditOverride antrean in-memory.
 */

type Row = Record<string, unknown>

function model(rows: Row[] = []) {
  return {
    findMany: vi.fn(async () => rows),
    findFirst: vi.fn(async () => rows[0] ?? null),
    findUnique: vi.fn(async () => rows[0] ?? null),
    create: vi.fn(async ({ data }: { data: Row }) => ({ id: 501, ...data })),
    update: vi.fn(async ({ data }: { data: Row }) => ({ id: 501, ...data })),
  }
}

function makeTx(opts: {
  gateEnabled?: boolean
  creditLimit?: number
  customerDeletedAt?: Date | null
  overrides?: Row[]
  invoices?: Row[]
  returns?: Row[]
  journals?: Row[]
  receivableAccountId?: number | null
}) {
  const tx: Record<string, unknown> = {
    $queryRaw: vi.fn(async () => []),
    systemSetting: model(
      opts.gateEnabled === undefined
        ? []
        : [
            {
              creditGateEnabled: opts.gateEnabled,
              salesReceivableAccountId: opts.receivableAccountId ?? null,
            },
          ],
    ),
    customer: {
      findUnique: vi.fn(async () => ({
        creditLimit: opts.creditLimit ?? 0,
        deletedAt: opts.customerDeletedAt ?? null,
      })),
    },
    salesInvoice: model(opts.invoices ?? []),
    salesOrder: model(),
    downPayment: model(),
    customerCredit: model(),
    workOrder: model(),
    quotation: model(),
    salesReturn: model(opts.returns ?? []),
    journal: model(opts.journals ?? []),
    creditOverride: {
      findMany: vi.fn(async () => opts.overrides ?? []),
      create: vi.fn(async ({ data }: { data: Row }) => ({ id: 501, ...data })),
      update: vi.fn(async ({ data }: { data: Row }) => ({ id: 501, ...data })),
    },
  }
  return tx as never
}

import {
  assessCreditGateInTx,
  assertCreditGatePassed,
  creditAttemptFingerprint,
  creditOverrideExpiryWib,
  deriveCreditOverrideStatus,
} from "../credit-gate.service"

const attempt = {
  customerId: 3,
  documentType: "sales_order" as const,
  attemptedAmount: 600_000,
  requestedBy: 7,
  requestReason: "Proyek mendesak pelanggan",
}

describe("credit-gate.service (F-2026-10-25-035-B)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("AC-CL2-B1: saklar mati -> gate_off, nol penilaian lanjut", async () => {
    const tx = makeTx({ gateEnabled: false })
    const out = await assessCreditGateInTx(tx, attempt)
    expect(out.kind).toBe("gate_off")
    expect((tx as never as { $queryRaw: ReturnType<typeof vi.fn> }).$queryRaw).not.toHaveBeenCalled()
  })

  it("saklar belum ada baris -> fail-safe gate_off", async () => {
    const tx = makeTx({})
    const out = await assessCreditGateInTx(tx, attempt)
    expect(out.kind).toBe("gate_off")
  })

  it("AC-CL2-B3: limit 0 (unset) -> allowed walau nominal besar", async () => {
    const tx = makeTx({ gateEnabled: true, creditLimit: 0 })
    const out = await assessCreditGateInTx(tx, attempt)
    expect(out.kind).toBe("allowed")
    if (out.kind === "allowed") expect(out.assessment.status).toBe("unset")
  })

  it("AC-CL2-B3: warning (80-99%) -> allowed", async () => {
    const tx = makeTx({ gateEnabled: true, creditLimit: 1_000_000 })
    const out = await assessCreditGateInTx(tx, {
      ...attempt,
      attemptedAmount: 900_000,
    })
    expect(out.kind).toBe("allowed")
    if (out.kind === "allowed") expect(out.assessment.status).toBe("warning")
  })

  it("AC-CL2-B2: over tanpa override -> pending lahir + pesan limit/paparan/label", async () => {
    const tx = makeTx({ gateEnabled: true, creditLimit: 500_000 })
    const out = await assessCreditGateInTx(tx, attempt)
    expect(out.kind).toBe("override_pending")
    if (out.kind === "override_pending") {
      expect(out.overrideId).toBe(501)
      expect(out.message).toContain("Lewat batas")
      expect(out.message).toContain("500")
      expect(out.assessment.exposure).toBe(600_000)
    }
    const create = (tx as never as { creditOverride: { create: ReturnType<typeof vi.fn> } })
      .creditOverride.create
    expect(create).toHaveBeenCalledTimes(1)
    const data = create.mock.calls[0][0].data
    expect(data.status).toBe("pending")
    expect(data.requestedBy).toBe(7)
    expect(data.fingerprint).toBe(creditAttemptFingerprint(attempt))
  })

  it("over tanpa alasan -> blocked tanpa rekod", async () => {
    const tx = makeTx({ gateEnabled: true, creditLimit: 500_000 })
    const out = await assessCreditGateInTx(tx, { ...attempt, requestReason: "  " })
    expect(out.kind).toBe("blocked")
    const create = (tx as never as { creditOverride: { create: ReturnType<typeof vi.fn> } })
      .creditOverride.create
    expect(create).not.toHaveBeenCalled()
  })

  it("AC-CL2-B4: approved cocok sidik -> override_used + transisi used sekali", async () => {
    const approved = {
      id: 44,
      fingerprint: creditAttemptFingerprint(attempt),
      status: "approved",
      createdAt: new Date(),
      expiresAt: creditOverrideExpiryWib(new Date()),
    }
    const tx = makeTx({ gateEnabled: true, creditLimit: 500_000, overrides: [approved] })
    const out = await assessCreditGateInTx(tx, attempt)
    expect(out.kind).toBe("override_used")
    if (out.kind === "override_used") expect(out.overrideId).toBe(44)
    const update = (tx as never as { creditOverride: { update: ReturnType<typeof vi.fn> } })
      .creditOverride.update
    expect(update).toHaveBeenCalledWith({
      where: { id: 44 },
      data: { status: "used" },
    })
  })

  it("AC-CL2-B6: limit naik sampai tidak over -> allowed tanpa override", async () => {
    const tx = makeTx({ gateEnabled: true, creditLimit: 2_000_000 })
    const out = await assessCreditGateInTx(tx, attempt)
    expect(out.kind).toBe("allowed")
  })

  it("EC-CL2-3: pelanggan terarsip + over -> blocked tanpa rekod baru", async () => {
    const tx = makeTx({
      gateEnabled: true,
      creditLimit: 500_000,
      customerDeletedAt: new Date(),
    })
    const out = await assessCreditGateInTx(tx, attempt)
    expect(out.kind).toBe("blocked")
    const create = (tx as never as { creditOverride: { create: ReturnType<typeof vi.fn> } })
      .creditOverride.create
    expect(create).not.toHaveBeenCalled()
  })

  it("pending existing identik -> override_pending id sama, nol create", async () => {
    const pending = {
      id: 45,
      fingerprint: creditAttemptFingerprint(attempt),
      status: "pending",
      createdAt: new Date(),
      expiresAt: null,
    }
    const tx = makeTx({ gateEnabled: true, creditLimit: 500_000, overrides: [pending] })
    const out = await assessCreditGateInTx(tx, attempt)
    expect(out.kind).toBe("override_pending")
    if (out.kind === "override_pending") expect(out.overrideId).toBe(45)
    const create = (tx as never as { creditOverride: { create: ReturnType<typeof vi.fn> } })
      .creditOverride.create
    expect(create).not.toHaveBeenCalled()
  })

  it("S-1: returnCredit retur completed + jurnal POSTED Cr Piutang mengurangi K1 persis nominalnya", async () => {
    // Faktur recognised 900rb belum dibayar; retur completed atas faktur itu
    // menjurnal Cr Piutang 300rb -> K1 = 600rb. Percobaan SO 350rb: paparan
    // 950rb (warning, allowed). Tanpa pengurang returnCredit paparan jadi
    // 1.250.000 (over) — mutasi cabut pengurang wajib memerahkan tes ini.
    const tx = makeTx({
      gateEnabled: true,
      creditLimit: 1_000_000,
      receivableAccountId: 110,
      invoices: [{ id: 11, grandTotal: 900_000, paidAmount: 0, salesOrderId: null, quotationId: null }],
      returns: [{ id: 21, salesInvoiceId: 11 }],
      journals: [{ referenceId: 21, entries: [{ credit: 300_000 }] }],
    })
    const out = await assessCreditGateInTx(tx, { ...attempt, attemptedAmount: 350_000 })
    expect(out.kind).toBe("allowed")
    if (out.kind === "allowed") {
      expect(out.assessment.exposure).toBe(950_000)
      expect(out.assessment.status).toBe("warning")
    }
    const journalFindMany = (tx as never as { journal: { findMany: ReturnType<typeof vi.fn> } })
      .journal.findMany
    expect(journalFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
          status: "POSTED",
          referenceType: "SalesReturn",
          referenceId: { in: [21] },
        }),
      }),
    )
  })

  it("EC-CL2-1: kunci baris pelanggan diambil saat penilaian aktif", async () => {
    const tx = makeTx({ gateEnabled: true, creditLimit: 0 })
    await assessCreditGateInTx(tx, attempt)
    expect(
      (tx as never as { $queryRaw: ReturnType<typeof vi.fn> }).$queryRaw,
    ).toHaveBeenCalled()
  })
})

describe("sidik + kedaluwarsa", () => {
  it("sidik berubah bila nominal/pembuat/kaitan berubah", () => {
    const base = creditAttemptFingerprint(attempt)
    expect(creditAttemptFingerprint({ ...attempt, attemptedAmount: 1 })).not.toBe(base)
    expect(creditAttemptFingerprint({ ...attempt, requestedBy: 9 })).not.toBe(base)
    expect(creditAttemptFingerprint({ ...attempt, quotationId: 5 })).not.toBe(base)
    expect(creditAttemptFingerprint(attempt)).toBe(base)
  })

  it("approved kedaluwarsa 23:59:59 WIB hari sama", () => {
    // 10:00 WIB = 03:00 UTC.
    const now = new Date("2026-10-26T03:00:00.000Z")
    const exp = creditOverrideExpiryWib(now)
    expect(exp.toISOString()).toBe("2026-10-26T16:59:59.999Z")
  })

  it("derive: approved lewat expiresAt -> expired; pending >1 hari kerja -> expired", () => {
    const now = new Date("2026-10-27T03:00:00.000Z") // Selasa 10:00 WIB
    expect(
      deriveCreditOverrideStatus(
        { status: "approved", createdAt: new Date("2026-10-26T03:00:00Z"), expiresAt: new Date("2026-10-26T16:59:59.999Z") },
        now,
      ),
    ).toBe("expired")
    expect(
      deriveCreditOverrideStatus(
        { status: "pending", createdAt: new Date("2026-10-23T03:00:00Z"), expiresAt: null },
        now,
      ),
    ).toBe("expired")
    expect(
      deriveCreditOverrideStatus(
        { status: "pending", createdAt: now, expiresAt: null },
        now,
      ),
    ).toBe("pending")
  })

  it("assertCreditGatePassed: blocked/pending throw, used -> id, lain null", () => {
    expect(() =>
      assertCreditGatePassed({
        kind: "blocked",
        assessment: {} as never,
        overrideId: null,
        overrideStatus: null,
        message: "tertahan uji",
      }),
    ).toThrow("tertahan uji")
    expect(
      assertCreditGatePassed({ kind: "override_used", assessment: {} as never, overrideId: 9 }),
    ).toBe(9)
    expect(assertCreditGatePassed({ kind: "gate_off" })).toBeNull()
  })
})
