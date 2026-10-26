import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * F-2026-10-25-035-B: penilaian gerbang kredit tx-aware.
 * Mock tx manual: systemSetting saklar, customer baris, komponen K1..K5
 * kosong kecuali yang diatur tes, creditOverride antrean in-memory.
 */

// Prisma global termock untuk fase 3 (persistCreditGatePending memakai
// prisma.$transaction sendiri, bukan tx lahir). State diatur per tes lewat
// phase3State; tx fase-3 meniru baris pelanggan + antrean override.
const phase3State = vi.hoisted(() => ({
  customerDeletedAt: null as Date | null,
  customerExists: true,
  candidates: [] as Record<string, unknown>[],
  created: [] as Record<string, unknown>[],
  nextId: 900,
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        $queryRaw: vi.fn(async () => []),
        customer: {
          findUnique: vi.fn(async () =>
            phase3State.customerExists
              ? { deletedAt: phase3State.customerDeletedAt }
              : null,
          ),
        },
        creditOverride: {
          findMany: vi.fn(async () => phase3State.candidates),
          create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
            const row = { id: phase3State.nextId, ...data }
            phase3State.created.push(row)
            return row
          }),
        },
      }),
  },
}))

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
  workOrders?: Row[]
  quotations?: Row[]
  k2Orders?: Row[]
  k5Orders?: Row[]
  k5Invoices?: Row[]
}) {
  // F1 (verdict Accountant PR #1072): jalur K5 butuh lookup berkait
  // quotation. Bedakan panggilan findMany dari bentuk where:
  // - where.customerId -> baris milik pelanggan ini (K1/K2);
  // - where.quotationId -> lookup per-quotation untuk K5.
  // Tanpa opsi baru, perilaku persis mock lama (semua kecuali K1 kosong).
  const invoiceFindMany = vi.fn(async (args?: { where?: Row }) => {
    if (opts.k5Invoices !== undefined && args?.where && "quotationId" in args.where) {
      return opts.k5Invoices
    }
    return opts.invoices ?? []
  })
  const orderFindMany = vi.fn(async (args?: { where?: Row }) => {
    if (args?.where && "customerId" in args.where) return opts.k2Orders ?? []
    if (args?.where && "quotationId" in args.where) return opts.k5Orders ?? []
    return []
  })
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
    salesInvoice: { ...model(opts.invoices ?? []), findMany: invoiceFindMany },
    salesOrder: { ...model(), findMany: orderFindMany },
    downPayment: model(),
    customerCredit: model(),
    workOrder: model(opts.workOrders ?? []),
    quotation: model(opts.quotations ?? []),
    salesReturn: model(opts.returns ?? []),
    journal: model(opts.journals ?? []),
    creditOverride: {
      findMany: vi.fn(async () => opts.overrides ?? []),
      findUnique: vi.fn(async () => (opts.overrides ?? [])[0] ?? null),
      create: vi.fn(async ({ data }: { data: Row }) => ({ id: 501, ...data })),
      update: vi.fn(async ({ data }: { data: Row }) => ({ id: 501, ...data })),
    },
  }
  return tx as never
}

import {
  assessCreditGateInTx,
  assertCreditGatePassed,
  consumeApprovedCreditOverrideInTx,
  creditAttemptFingerprint,
  creditOverrideExpiryWib,
  CreditGateBlockedError,
  deriveCreditOverrideStatus,
  persistCreditGatePending,
  type CreditGateOutcome,
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

  it("AC-CL2-B2 fase 1: over tanpa override -> blocked membawa attempt, NOL tulis rekod di tx lahir", async () => {
    // Fix TEMUAN 6422009586: rekod yang dibuat di tx lahir ikut rollback.
    // Fase 1 hanya menilai; persist pending adalah fase 3 di tx terpisah
    // (dibuktikan tes integrasi DB nyata, bukan mock ini).
    const tx = makeTx({ gateEnabled: true, creditLimit: 500_000 })
    const out = await assessCreditGateInTx(tx, attempt)
    expect(out.kind).toBe("blocked")
    if (out.kind === "blocked") {
      expect(out.message).toContain("Lewat batas")
      expect(out.message).toContain("500")
      expect(out.assessment.exposure).toBe(600_000)
      expect(out.attempt).toBe(attempt)
    }
    const create = (tx as never as { creditOverride: { create: ReturnType<typeof vi.fn> } })
      .creditOverride.create
    expect(create).not.toHaveBeenCalled()
    const update = (tx as never as { creditOverride: { update: ReturnType<typeof vi.fn> } })
      .creditOverride.update
    expect(update).not.toHaveBeenCalled()
  })

  it("over tanpa alasan -> blocked tanpa rekod", async () => {
    const tx = makeTx({ gateEnabled: true, creditLimit: 500_000 })
    const out = await assessCreditGateInTx(tx, { ...attempt, requestReason: "  " })
    expect(out.kind).toBe("blocked")
    const create = (tx as never as { creditOverride: { create: ReturnType<typeof vi.fn> } })
      .creditOverride.create
    expect(create).not.toHaveBeenCalled()
  })

  it("AC-CL2-B4 fase 1+2: approved cocok sidik -> override_ready tanpa transisi; consume menandai used+dokumen sekali", async () => {
    const approved = {
      id: 44,
      customerId: 3,
      fingerprint: creditAttemptFingerprint(attempt),
      status: "approved",
      createdAt: new Date(),
      expiresAt: creditOverrideExpiryWib(new Date()),
    }
    const tx = makeTx({ gateEnabled: true, creditLimit: 500_000, overrides: [approved] })
    const out = await assessCreditGateInTx(tx, attempt)
    expect(out.kind).toBe("override_ready")
    if (out.kind === "override_ready") expect(out.overrideId).toBe(44)
    const update = (tx as never as { creditOverride: { update: ReturnType<typeof vi.fn> } })
      .creditOverride.update
    expect(update).not.toHaveBeenCalled()
    await consumeApprovedCreditOverrideInTx(tx, 44, attempt, {
      id: 88,
      documentNo: "SO-001",
    })
    expect(update).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledWith({
      where: { id: 44 },
      data: { status: "used", usedDocumentId: 88, usedDocumentNo: "SO-001" },
    })
  })

  it("fase 2: approved dipakai pihak lain (status used) -> consume throw, dokumen tidak lahir", async () => {
    const used = {
      id: 44,
      customerId: 3,
      fingerprint: creditAttemptFingerprint(attempt),
      status: "used",
      createdAt: new Date(),
      expiresAt: creditOverrideExpiryWib(new Date()),
    }
    const tx = makeTx({ gateEnabled: true, creditLimit: 500_000, overrides: [used] })
    await expect(
      consumeApprovedCreditOverrideInTx(tx, 44, attempt, { id: 88, documentNo: "SO-001" }),
    ).rejects.toThrow("sudah tidak dapat dipakai")
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

  it("pending existing identik -> tetap blocked (belum disetujui), nol tulis di tx lahir", async () => {
    const pending = {
      id: 45,
      fingerprint: creditAttemptFingerprint(attempt),
      status: "pending",
      createdAt: new Date(),
      expiresAt: null,
    }
    const tx = makeTx({ gateEnabled: true, creditLimit: 500_000, overrides: [pending] })
    const out = await assessCreditGateInTx(tx, attempt)
    expect(out.kind).toBe("blocked")
    const create = (tx as never as { creditOverride: { create: ReturnType<typeof vi.fn> } })
      .creditOverride.create
    expect(create).not.toHaveBeenCalled()
  })

  it("F1 anti-dobel K5 SO-dari-quotation: K5 sumber digantikan SO baru, WO lain tetap dihitung", async () => {
    // F1 verdict Accountant PR #1072 (6425538156): WO aktif atas quotation
    // 10 (400rb) + WO lain atas quotation 20 (200rb) -> K5 existing 600rb,
    // linkedQuotationWo = 400rb. SO baru 600rb lahir dari quotation 10:
    // paparan proyeksi = K2 600rb + K5 sisa 200rb = 800rb (allowed, limit
    // 1jt). Bila pengurangan linkedQuotationWo di projectedRow dicabut,
    // paparan semu 1.200.000 -> over/blocked, tes ini wajib MERAH.
    const tx = makeTx({
      gateEnabled: true,
      creditLimit: 1_000_000,
      workOrders: [
        { customerId: 3, quotationId: 10 },
        { customerId: 3, quotationId: 20 },
      ],
      quotations: [
        { id: 10, customerId: 3, grandTotal: 400_000 },
        { id: 20, customerId: 3, grandTotal: 200_000 },
      ],
      k5Orders: [],
      k5Invoices: [],
    })
    const soFromQuotation = {
      ...attempt,
      attemptedAmount: 600_000,
      quotationId: 10,
    }
    const out = await assessCreditGateInTx(tx, soFromQuotation)
    expect(out.kind).toBe("allowed")
    if (out.kind === "allowed") {
      expect(out.assessment.exposure).toBe(800_000)
      expect(out.assessment.status).toBe("warning")
    }
  })

  it("F1 anti-dobel K5 invoice-dari-quotation tanpa SO: K5 sumber digantikan invoice baru, WO lain tetap dihitung", async () => {
    // Jalur projectedRow baris 491-500: invoice 500rb lahir langsung dari
    // quotation 10 tanpa SO. K5 existing 600rb (quotation 10: 400rb +
    // quotation 20: 200rb), linkedQuotationWo = 400rb. Paparan proyeksi =
    // K1 500rb + K5 sisa 200rb = 700rb (allowed, limit 1jt). Bila
    // pengurangan dicabut, paparan semu 1.100.000 -> over/blocked.
    const tx = makeTx({
      gateEnabled: true,
      creditLimit: 1_000_000,
      workOrders: [
        { customerId: 3, quotationId: 10 },
        { customerId: 3, quotationId: 20 },
      ],
      quotations: [
        { id: 10, customerId: 3, grandTotal: 400_000 },
        { id: 20, customerId: 3, grandTotal: 200_000 },
      ],
      k5Orders: [],
      k5Invoices: [],
    })
    const out = await assessCreditGateInTx(tx, {
      customerId: 3,
      documentType: "sales_invoice",
      attemptedAmount: 500_000,
      requestedBy: 7,
      quotationId: 10,
      requestReason: "Proyek mendesak pelanggan",
    })
    expect(out.kind).toBe("allowed")
    if (out.kind === "allowed") {
      expect(out.assessment.exposure).toBe(700_000)
      expect(out.assessment.status).toBe("ok")
    }
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

  it("assertCreditGatePassed: blocked throw CreditGateBlockedError membawa outcome, ready -> id, lain null", () => {
    let caught: unknown
    try {
      assertCreditGatePassed({
        kind: "blocked",
        assessment: {} as never,
        message: "tertahan uji",
        attempt,
      })
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(CreditGateBlockedError)
    expect((caught as CreditGateBlockedError).outcome.attempt).toBe(attempt)
    expect(
      assertCreditGatePassed({
        kind: "override_ready",
        assessment: {} as never,
        overrideId: 9,
        attempt,
      }),
    ).toBe(9)
    expect(assertCreditGatePassed({ kind: "gate_off" })).toBeNull()
  })
})

describe("fase 3: persistCreditGatePending (penjaga unit TEMUAN 6422009586)", () => {
  const assessment = {
    status: "over" as const,
    statusLabel: "Lewat batas",
    exposure: 600_000,
    creditLimit: 500_000,
    utilization: 1.2,
    blocked: true,
    reason: "over_limit" as never,
  }
  const blocked = (
    over: { requestReason?: string | null } = {},
  ): Extract<CreditGateOutcome, { kind: "blocked" }> => ({
    kind: "blocked",
    assessment,
    message: "tertahan uji",
    attempt: { ...attempt, ...over },
  })

  beforeEach(() => {
    phase3State.customerDeletedAt = null
    phase3State.customerExists = true
    phase3State.candidates = []
    phase3State.created = []
  })

  it("membuat tepat 1 pending dengan angka fase 1 apa adanya (tanpa hitung ulang)", async () => {
    const id = await persistCreditGatePending(blocked())
    expect(id).toBe(900)
    expect(phase3State.created).toHaveLength(1)
    expect(phase3State.created[0]).toMatchObject({
      customerId: 3,
      documentType: "sales_order",
      fingerprint: creditAttemptFingerprint(attempt),
      attemptedAmount: 600_000,
      creditLimit: 500_000,
      exposure: 600_000,
      exposureStatus: "over",
      utilization: 1.2,
      requestedBy: 7,
      requestReason: "Proyek mendesak pelanggan",
      status: "pending",
    })
  })

  it("idempoten sidik: pending hidup dipakai ulang, nol baris baru", async () => {
    phase3State.candidates = [
      {
        id: 77,
        fingerprint: creditAttemptFingerprint(attempt),
        status: "pending",
        createdAt: new Date(),
        expiresAt: null,
      },
    ]
    expect(await persistCreditGatePending(blocked())).toBe(77)
    expect(phase3State.created).toHaveLength(0)
  })

  it("approved hidup dipakai ulang (tidak diduplikasi); used/expired lahir pending baru", async () => {
    phase3State.candidates = [
      {
        id: 78,
        fingerprint: creditAttemptFingerprint(attempt),
        status: "approved",
        createdAt: new Date(),
        expiresAt: creditOverrideExpiryWib(new Date()),
      },
    ]
    expect(await persistCreditGatePending(blocked())).toBe(78)
    expect(phase3State.created).toHaveLength(0)

    phase3State.candidates = [
      {
        id: 79,
        fingerprint: creditAttemptFingerprint(attempt),
        status: "used",
        createdAt: new Date(),
        expiresAt: null,
      },
    ]
    expect(await persistCreditGatePending(blocked())).toBe(900)
    expect(phase3State.created).toHaveLength(1)
  })

  it("tanpa alasan / alasan kosong -> null, nol tulis (jalur convert/DP/resync eksplisit)", async () => {
    expect(await persistCreditGatePending(blocked({ requestReason: null }))).toBeNull()
    expect(await persistCreditGatePending(blocked({ requestReason: "   " }))).toBeNull()
    expect(phase3State.created).toHaveLength(0)
  })

  it("pelanggan terarsip atau hilang -> null, nol tulis", async () => {
    phase3State.customerDeletedAt = new Date()
    expect(await persistCreditGatePending(blocked())).toBeNull()
    phase3State.customerDeletedAt = null
    phase3State.customerExists = false
    expect(await persistCreditGatePending(blocked())).toBeNull()
    expect(phase3State.created).toHaveLength(0)
  })
})

describe("fase 2: consumeApprovedCreditOverrideInTx cek sidik/status (penjaga unit)", () => {
  const doc = { id: 88, documentNo: "SO-001" }

  it("sidik tidak cocok (nominal berubah) -> throw, override tidak ditandai used", async () => {
    const row = {
      id: 44,
      customerId: 3,
      fingerprint: creditAttemptFingerprint({ ...attempt, attemptedAmount: 1 }),
      status: "approved",
      createdAt: new Date(),
      expiresAt: creditOverrideExpiryWib(new Date()),
    }
    const tx = makeTx({ gateEnabled: true, creditLimit: 500_000, overrides: [row] })
    await expect(consumeApprovedCreditOverrideInTx(tx, 44, attempt, doc)).rejects.toThrow(
      "sudah tidak dapat dipakai",
    )
    const update = (tx as never as { creditOverride: { update: ReturnType<typeof vi.fn> } })
      .creditOverride.update
    expect(update).not.toHaveBeenCalled()
  })

  it("pelanggan override lain -> throw, tidak used", async () => {
    const row = {
      id: 44,
      customerId: 99,
      fingerprint: creditAttemptFingerprint(attempt),
      status: "approved",
      createdAt: new Date(),
      expiresAt: creditOverrideExpiryWib(new Date()),
    }
    const tx = makeTx({ gateEnabled: true, creditLimit: 500_000, overrides: [row] })
    await expect(consumeApprovedCreditOverrideInTx(tx, 44, attempt, doc)).rejects.toThrow(
      "sudah tidak dapat dipakai",
    )
  })

  it("approved kedaluwarsa -> throw, tidak used", async () => {
    const row = {
      id: 44,
      customerId: 3,
      fingerprint: creditAttemptFingerprint(attempt),
      status: "approved",
      createdAt: new Date("2026-10-20T03:00:00Z"),
      expiresAt: new Date("2026-10-20T16:59:59.999Z"),
    }
    const tx = makeTx({ gateEnabled: true, creditLimit: 500_000, overrides: [row] })
    await expect(
      consumeApprovedCreditOverrideInTx(tx, 44, { ...attempt, now: new Date() }, doc),
    ).rejects.toThrow("sudah tidak dapat dipakai")
  })

  it("pelanggan terarsip saat consume -> throw, tidak used", async () => {
    const row = {
      id: 44,
      customerId: 3,
      fingerprint: creditAttemptFingerprint(attempt),
      status: "approved",
      createdAt: new Date(),
      expiresAt: creditOverrideExpiryWib(new Date()),
    }
    const tx = makeTx({
      gateEnabled: true,
      creditLimit: 500_000,
      customerDeletedAt: new Date(),
      overrides: [row],
    })
    await expect(consumeApprovedCreditOverrideInTx(tx, 44, attempt, doc)).rejects.toThrow(
      "sudah tidak dapat dipakai",
    )
  })
})
