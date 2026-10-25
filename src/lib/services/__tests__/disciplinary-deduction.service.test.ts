import { describe, it, expect, vi, beforeEach } from "vitest"

/** F-2026-10-25-020-V Putusan 3/5/6: fisik tahap 2 BR-DISC-09. */

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/services/period-lock.service", () => ({
  assertPeriodOpen: vi.fn().mockResolvedValue(undefined),
}))
const journalMocks = vi.hoisted(() => ({
  createJournal: vi.fn().mockResolvedValue({ id: 99 }),
}))
vi.mock("@/lib/services/journal.service", () => ({
  JournalService: class {
    createJournal = journalMocks.createJournal
  },
}))

vi.mock("@/lib/utils/slug-db", () => ({ nextSlug: vi.fn().mockResolvedValue("kep-hr-2026-010") }))

import { applyDisciplinaryDeduction, createDisciplinaryDeductionDecision, resolveDisc09StatutoryMapping } from "../disciplinary-deduction.service"

const ACCOUNTS: Record<number, { code: string; isActive: boolean; deletedAt: null }> = {
  230: { code: "210204", isActive: true, deletedAt: null },
  231: { code: "210210", isActive: true, deletedAt: null },
  232: { code: "210211", isActive: true, deletedAt: null },
  710: { code: "710006", isActive: true, deletedAt: null },
  110: { code: "110501", isActive: true, deletedAt: null },
}

function makeClient(over: Record<string, any> = {}) {
  const apps: any[] = [...(over.apps ?? [])]
  const client: Record<string, any> = {
    disciplinaryDeductionDecision: {
      create: vi.fn().mockImplementation(async ({ data }: any) => ({ id: 9, ...data })),
      findUnique: vi.fn().mockResolvedValue(
        over.decision === undefined
          ? {
              id: 7,
              documentNo: "KEP-HR/2026/010",
              decidedAt: new Date("2026-10-20T00:00:00+07:00"),
              employeeId: 42,
              kind: "denda",
              amount: 500_000,
              compensationAccountId: null,
              signedBy: 3,
              deletedAt: null,
            }
          : over.decision,
      ),
    },
    employee: { findUnique: vi.fn().mockResolvedValue({ id: 42, deletedAt: null }) },
    disciplinaryDeductionApplication: {
      findUnique: vi.fn().mockImplementation(async ({ where }: any) => apps.find((a) => a.idempotencyKey === where.idempotencyKey) ?? null),
      aggregate: vi.fn().mockResolvedValue({ _sum: { amount: 0 } }),
      create: vi.fn().mockImplementation(async ({ data }: any) => {
        const row = { id: apps.length + 1, ...data }
        apps.push(row)
        return row
      }),
    },
    systemSetting: {
      findFirst: vi.fn().mockResolvedValue(
        over.settings === undefined
          ? { salariesPayableAccountId: 230, pph21PayableAccountId: 231, bpjsEmployeePayableAccountId: 232, disciplinaryFineIncomeAccountId: 710 }
          : over.settings,
      ),
    },
    account: {
      findUnique: vi.fn().mockImplementation(async ({ where }: any) => ACCOUNTS[where.id] ?? null),
    },
  }
  // client tanpa $transaction = jalur tx langsung (run(client))
  return { client: client as never, apps }
}

const input = {
  decisionId: 7,
  period: "2026-10",
  periodPay: 5_000_000,
  transactionDate: new Date("2026-10-31T00:00:00+07:00"),
}

describe("applyDisciplinaryDeduction", () => {
  beforeEach(() => vi.clearAllMocks())

  it("denda: jurnal Dr 210204 / Cr 710006 + baris aplikasi idempoten", async () => {
    const { client, apps } = makeClient()
    const r = await applyDisciplinaryDeduction(client, input)
    expect(r).toMatchObject({ journalId: 99, amount: 500_000, replayed: false })
    expect(journalMocks.createJournal).toHaveBeenCalledTimes(1)
    const arg = journalMocks.createJournal.mock.calls[0][0]
    expect(arg.entries).toEqual([
      expect.objectContaining({ accountId: 230, debit: 500_000, credit: 0 }),
      expect.objectContaining({ accountId: 710, debit: 0, credit: 500_000 }),
    ])
    expect(apps).toHaveLength(1)
    expect(apps[0].idempotencyKey).toBe("disc09:7:2026-10:denda")
  })

  it("QA-DISC09-5: replay keputusan+periode+jenis sama = nol jurnal baru", async () => {
    const { client } = makeClient()
    await applyDisciplinaryDeduction(client, input)
    const second = await applyDisciplinaryDeduction(client, input)
    expect(second.replayed).toBe(true)
    expect(second.journalId).toBe(99)
    expect(journalMocks.createJournal).toHaveBeenCalledTimes(1)
  })

  it("keputusan tanpa penandatangan ditolak (dokumen manusia wajib lengkap)", async () => {
    const { client } = makeClient({
      decision: {
        id: 7, documentNo: "KEP-HR/2026/010", decidedAt: new Date(), employeeId: 42,
        kind: "denda", amount: 500_000, compensationAccountId: null, signedBy: null, deletedAt: null,
      },
    })
    await expect(applyDisciplinaryDeduction(client, input)).rejects.toThrow(/penandatangan|Dokumen keputusan/)
    expect(journalMocks.createJournal).not.toHaveBeenCalled()
  })

  it("setting denda kosong = fail-closed, tanpa jurnal", async () => {
    const { client } = makeClient({
      settings: { salariesPayableAccountId: 230, pph21PayableAccountId: 231, bpjsEmployeePayableAccountId: 232, disciplinaryFineIncomeAccountId: null },
    })
    await expect(applyDisciplinaryDeduction(client, input)).rejects.toThrow(/belum dikonfigurasi/)
    expect(journalMocks.createJournal).not.toHaveBeenCalled()
  })

  it("ganti rugi wajib akun kompensasi; kredit ke 710006 ditolak", async () => {
    const base = {
      id: 7, documentNo: "KEP-HR/2026/011", decidedAt: new Date(), employeeId: 42,
      kind: "ganti_rugi", amount: 200_000, signedBy: 3, deletedAt: null,
    }
    const noAcct = makeClient({ decision: { ...base, compensationAccountId: null } })
    await expect(applyDisciplinaryDeduction(noAcct.client, input)).rejects.toThrow(/akun kompensasi/)

    const fineAcct = makeClient({ decision: { ...base, compensationAccountId: 710 } })
    await expect(applyDisciplinaryDeduction(fineAcct.client, input)).rejects.toThrow(/710006/)

    const okCase = makeClient({ decision: { ...base, compensationAccountId: 110 } })
    const r = await applyDisciplinaryDeduction(okCase.client, input)
    expect(r.amount).toBe(200_000)
    expect(journalMocks.createJournal.mock.calls.at(-1)![0].entries[1]).toMatchObject({ accountId: 110, credit: 200_000 })
  })
})

describe("createDisciplinaryDeductionDecision", () => {
  beforeEach(() => vi.clearAllMocks())
  const base = {
    documentNo: "KEP-HR/2026/010", decidedAt: new Date("2026-10-20T00:00:00+07:00"),
    employeeId: 42, kind: "denda" as const, amount: 500_000, signedBy: 3,
  }

  it("snapshot skorsing disiplin tanpa klausul PK/PP/PKB ditolak", async () => {
    const { client } = makeClient()
    await expect(
      createDisciplinaryDeductionDecision(client, { ...base, suspensionKind: "disiplin", suspensionPayTreatment: "tidak_dibayar" }),
    ).rejects.toThrow(/klausul PK\/PP\/PKB/)
  })

  it("skorsing proses PHK dengan perlakuan tidak dibayar ditolak", async () => {
    const { client } = makeClient()
    await expect(
      createDisciplinaryDeductionDecision(client, { ...base, suspensionKind: "proses_phk", suspensionPayTreatment: "tidak_dibayar" }),
    ).rejects.toThrow(/penuh/)
  })

  it("keputusan sah tersimpan verbatim dengan slug", async () => {
    const { client } = makeClient()
    const row: any = await createDisciplinaryDeductionDecision(client, {
      ...base, suspensionKind: "disiplin", suspensionPayTreatment: "proporsional", regulationReference: "PP Perusahaan Pasal 12",
    })
    expect(row.slug).toBe("kep-hr-2026-010")
    expect(row.suspensionPayTreatment).toBe("proporsional")
    expect(row.amount).toBe(500_000)
  })
})

describe("resolveDisc09StatutoryMapping (Putusan 5, fail-closed)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("akun 210210/210211 terpetakan benar; kode salah ditolak", async () => {
    const { client } = makeClient()
    await expect(resolveDisc09StatutoryMapping(client, { pph21: true, bpjs: true })).resolves.toEqual({
      pph21PayableAccountId: 231,
      bpjsEmployeePayableAccountId: 232,
    })
    const bad = makeClient({
      settings: { salariesPayableAccountId: 230, pph21PayableAccountId: 230, bpjsEmployeePayableAccountId: 232, disciplinaryFineIncomeAccountId: 710 },
    })
    await expect(resolveDisc09StatutoryMapping(bad.client, { pph21: true })).rejects.toThrow(/210210/)
  })
})
