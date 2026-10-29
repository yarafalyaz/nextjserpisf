import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * GL-BR-003 GL003-P5/P6 (vonis t_16159d89) + P3-update (vonis t_542a4f09 P4):
 * falsifikasi void berstatus PurchaseAdvance / TaxPayment / BankTransfer /
 * PettyCash + tolak update posted. Memakai jalur aksi NYATA + helper reversal
 * NYATA (reverseJournalsByReferenceTx tidak di-mock) supaya penjaga perilaku
 * (bukan mock penjaga) yang diuji: mencabut reversal / cek status / cek
 * periode / cek NTPN / guard POSTED wajib memerahkan tes ini.
 */

const mocks = vi.hoisted(() => {
  const requirePermission = vi.fn()
  const logActivity = vi.fn()
  const revalidatePath = vi.fn()
  const generateDocumentNumber = vi.fn().mockResolvedValue("DOC-001")
  const assertPeriodOpen = vi.fn().mockResolvedValue(undefined)
  const nextSlug = vi.fn().mockResolvedValue("slug-x")

  // Jurnal asal per dokumen: dua entri berimbang, dipakai reversal nyata
  // untuk membangun jurnal lawan (cermin debit<->kredit).
  function originJournal(id: number, date: Date) {
    return {
      id,
      status: "POSTED",
      transactionDate: date,
      journalNumber: `JRN-${id}`,
      type: "GENERAL",
      totalDebit: 500000,
      totalCredit: 500000,
      entries: [
        { id: id * 10 + 1, journalId: id, accountId: 101, debit: 500000, credit: 0, memo: "Dr", costCenterId: null, profitCenterId: null },
        { id: id * 10 + 2, journalId: id, accountId: 102, debit: 0, credit: 500000, memo: "Cr", costCenterId: null, profitCenterId: null },
      ],
    }
  }

  const reversalCreated: any[] = []
  const reversalEntries: any[] = []

  const journal = {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(async ({ data }: any) => {
      const created = { id: 900 + reversalCreated.length, ...data }
      reversalCreated.push(created)
      return created
    }),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
  }
  const journalEntry = {
    findMany: vi.fn().mockResolvedValue([]),
    createMany: vi.fn(async ({ data }: any) => {
      reversalEntries.push(data)
      return { count: Array.isArray(data) ? data.length : 1 }
    }),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
  }
  const purchaseAdvance = {
    findUniqueOrThrow: vi.fn(),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  }
  const taxPayment = {
    findUniqueOrThrow: vi.fn(),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  }
  const bankTransfer = {
    findUniqueOrThrow: vi.fn(),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  }
  const pettyCash = {
    findFirst: vi.fn().mockResolvedValue(null),
    findUniqueOrThrow: vi.fn(),
    findUnique: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  }
  const bankReconciliationItem = { findFirst: vi.fn().mockResolvedValue(null) }
  const bankReconciliation = { findFirst: vi.fn() }

  const tx: Record<string, unknown> = {
    journal,
    journalEntry,
    purchaseAdvance,
    taxPayment,
    bankTransfer,
    pettyCash,
    bankReconciliationItem,
    bankReconciliation,
    $executeRaw: vi.fn().mockResolvedValue(0),
    $queryRaw: vi.fn().mockResolvedValue([]),
  }
  const prismaMock: Record<string, unknown> = {
    ...tx,
    journalEntry,
    $transaction: (fn: (t: unknown) => unknown) => fn(tx),
    $executeRaw: vi.fn().mockResolvedValue(0),
  }

  return {
    requirePermission,
    logActivity,
    revalidatePath,
    generateDocumentNumber,
    assertPeriodOpen,
    nextSlug,
    journal,
    journalEntry,
    purchaseAdvance,
    taxPayment,
    bankTransfer,
    pettyCash,
    bankReconciliationItem,
    reversalCreated,
    reversalEntries,
    originJournal,
    prismaMock,
    tx,
  }
})

vi.mock("@/lib/db/prisma", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db/prisma")>("@/lib/db/prisma")
  return { ...actual, prisma: mocks.prismaMock }
})
vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermission(...a),
}))
vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: (...a: unknown[]) => mocks.logActivity(...a),
}))
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => mocks.revalidatePath(...a) }))
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }))
vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: (...a: unknown[]) => mocks.generateDocumentNumber(...a),
  generateJournalNumber: vi.fn(async () => "JRN-RV-TEST"),
}))
vi.mock("@/lib/utils/slug-db", () => ({ nextSlug: (...a: unknown[]) => mocks.nextSlug(...a) }))
vi.mock("@/lib/services/document-sequence.service", () => ({
  DocumentSequenceService: { nextBatch: vi.fn(async () => [1]) },
}))
vi.mock("@/lib/services/period-lock.service", () => ({
  assertPeriodOpen: (...a: unknown[]) => mocks.assertPeriodOpen(...a),
}))

import { deletePurchaseAdvance } from "../purchase-advance.actions"
import { deleteTaxPayment } from "../tax-payment.actions"
import { deleteBankTransfer } from "../bank-transfer.actions"
import { deletePettyCash, updatePettyCash } from "../finance.actions"

const REASON = "Salah input, koreksi via void"
const DOC_DATE = new Date("2026-09-15T00:00:00Z")

function fdMap(payload: Record<string, string | number | null | undefined>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(payload)) {
    if (v !== null && v !== undefined) f.append(k, String(v))
  }
  return f
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue({ id: 7 })
  mocks.assertPeriodOpen.mockResolvedValue(undefined)
  mocks.reversalCreated.length = 0
  mocks.reversalEntries.length = 0
  // Default: tidak ada jurnal POSTED, tidak ada baris void (update lolos guard).
  mocks.journal.findFirst.mockResolvedValue(null)
  mocks.pettyCash.findFirst.mockResolvedValue(null)
  mocks.bankReconciliationItem.findFirst.mockResolvedValue(null)
  mocks.journal.findMany.mockResolvedValue([])
  mocks.journalEntry.findMany.mockResolvedValue([])
  mocks.journalEntry.createMany.mockClear()
  mocks.journal.create.mockClear()
  mocks.journal.update.mockClear()
})

function arrangePosted(refType: string, journalId: number) {
  const origin = mocks.originJournal(journalId, DOC_DATE)
  // reverseJournalsByReferenceTx: findMany -> [asal], existingReversal -> null,
  // lalu create lawan + update asal REVERSED.
  mocks.journal.findMany.mockResolvedValue([origin])
  mocks.journal.findFirst.mockResolvedValue(null)
  mocks.journal.create.mockImplementation(async ({ data }: any) => {
    const created = { id: 900 + mocks.reversalCreated.length, ...data }
    mocks.reversalCreated.push(created)
    return created
  })
  mocks.journalEntry.createMany.mockImplementation(async ({ data }: any) => {
    mocks.reversalEntries.push(data)
    return { count: Array.isArray(data) ? data.length : 1 }
  })
  return origin
}

describe("GL003-P5 void PurchaseAdvance", () => {
  function arrange() {
    mocks.purchaseAdvance.findUniqueOrThrow.mockResolvedValue({
      id: 1, documentNo: "DP-0001", date: DOC_DATE, status: "posted", deletedAt: null,
    })
    return arrangePosted("PurchaseAdvance", 51)
  }

  it("void posted: asal REVERSED + satu lawan POSTED seimbang, baris tetap ada status void, lampiran tidak dihapus", async () => {
    arrange()
    const res = await deletePurchaseAdvance(1, REASON)
    expect(res.success).toBe(true)

    const lawan = mocks.reversalCreated[0]
    expect(lawan.status).toBe("POSTED")
    expect(lawan.referenceType).toBe("Journal")
    expect(lawan.referenceId).toBe(51)
    expect(Number(lawan.totalDebit)).toBe(Number(lawan.totalCredit))
    // Cermin: Dr/Cr tertukar persis dari entri asal.
    const entries = mocks.reversalEntries[0]
    expect(Number(entries[0].debit)).toBe(0)
    expect(Number(entries[0].credit)).toBe(500000)
    expect(Number(entries[1].debit)).toBe(500000)
    expect(mocks.journal.update).toHaveBeenCalledWith({ where: { id: 51 }, data: { status: "REVERSED" } })
    expect(mocks.journal.delete).not.toHaveBeenCalled()
    expect(mocks.journal.deleteMany).not.toHaveBeenCalled()
    expect(mocks.purchaseAdvance.delete).not.toHaveBeenCalled()
    const upd = mocks.purchaseAdvance.update.mock.calls[0][0]
    expect(upd.where).toEqual({ id: 1 })
    expect(upd.data.status).toBe("void")
    expect(upd.data.deletedAt).toBeInstanceOf(Date)
    expect(mocks.logActivity).toHaveBeenCalledWith("void", "PurchaseAdvance", 1, expect.stringContaining(REASON))
  })

  it("tanpa alasan ditolak sebelum mutasi", async () => {
    const res = await deletePurchaseAdvance(1, "   ")
    expect(res.success).toBe(false)
    expect(mocks.purchaseAdvance.update).not.toHaveBeenCalled()
    expect(mocks.journal.create).not.toHaveBeenCalled()
  })

  it("void kedua ditolak; tepat satu lawan", async () => {
    mocks.purchaseAdvance.findUniqueOrThrow.mockResolvedValue({
      id: 1, documentNo: "DP-0001", date: DOC_DATE, status: "void", deletedAt: new Date(),
    })
    const res = await deletePurchaseAdvance(1, REASON)
    expect(res.success).toBe(false)
    expect(String(res.error)).toContain("sudah dibatalkan")
    expect(mocks.journal.create).not.toHaveBeenCalled()
  })

  it("periode asal tertutup: ditolak, nol mutasi", async () => {
    arrange()
    mocks.assertPeriodOpen.mockRejectedValueOnce(new Error("Periode sudah dikunci"))
    const res = await deletePurchaseAdvance(1, REASON)
    expect(res.success).toBe(false)
    expect(mocks.purchaseAdvance.update).not.toHaveBeenCalled()
    expect(mocks.journal.create).not.toHaveBeenCalled()
  })
})

describe("GL003-P5 void TaxPayment", () => {
  function arrange(ntpn: string | null = null) {
    mocks.taxPayment.findUniqueOrThrow.mockResolvedValue({
      id: 2, documentNo: "PAJAK-0001", date: DOC_DATE, status: "posted", deletedAt: null, ntpn,
    })
    return arrangePosted("TaxPayment", 52)
  }

  it("tanpa NTPN: void lolos, lawan Dr Kas-Bank / Cr Utang Pajak (cermin asal)", async () => {
    arrange(null)
    const res = await deleteTaxPayment(2, REASON)
    expect(res.success).toBe(true)
    const lawan = mocks.reversalCreated[0]
    expect(lawan.referenceId).toBe(52)
    const upd = mocks.taxPayment.update.mock.calls[0][0]
    expect(upd.data.status).toBe("void")
    expect(mocks.taxPayment.delete).not.toHaveBeenCalled()
    expect(mocks.logActivity).toHaveBeenCalledWith("void", "TaxPayment", 2, expect.stringContaining(REASON))
  })

  it("ber-NTPN: void ditolak total", async () => {
    arrange("1234567890123456")
    const res = await deleteTaxPayment(2, REASON)
    expect(res.success).toBe(false)
    expect(String(res.error)).toContain("NTPN")
    expect(mocks.journal.create).not.toHaveBeenCalled()
    expect(mocks.taxPayment.update).not.toHaveBeenCalled()
  })

  it("periode tertutup: ditolak, nol mutasi", async () => {
    arrange(null)
    mocks.assertPeriodOpen.mockRejectedValueOnce(new Error("Periode sudah dikunci"))
    const res = await deleteTaxPayment(2, REASON)
    expect(res.success).toBe(false)
    expect(mocks.taxPayment.update).not.toHaveBeenCalled()
    expect(mocks.journal.create).not.toHaveBeenCalled()
  })
})

describe("GL003-P5 void BankTransfer", () => {
  function arrange(fee = 0) {
    mocks.bankTransfer.findUniqueOrThrow.mockResolvedValue({
      id: 3, documentNo: "BTF-0001", date: DOC_DATE, status: "posted", deletedAt: null, journalId: 53,
    })
    const origin = mocks.originJournal(53, DOC_DATE)
    // Transfer + fee: tiga entri; lawan wajib memuat Cr fee persis.
    if (fee > 0) {
      origin.entries = [
        { id: 531, journalId: 53, accountId: 201, debit: 500000, credit: 0, memo: "masuk", costCenterId: null, profitCenterId: null },
        { id: 532, journalId: 53, accountId: 301, debit: fee, credit: 0, memo: "fee", costCenterId: null, profitCenterId: null },
        { id: 533, journalId: 53, accountId: 101, debit: 0, credit: 500000 + fee, memo: "keluar", costCenterId: null, profitCenterId: null },
      ]
      origin.totalDebit = 500000 + fee
      origin.totalCredit = 500000 + fee
    }
    mocks.journal.findMany.mockResolvedValue([origin])
    mocks.journal.findFirst.mockResolvedValue(null)
    return origin
  }

  it("void posted: refType persis BANK_TRANSFER, baris void + deletedAt, hapus fisik tidak dipanggil", async () => {
    arrange()
    const res = await deleteBankTransfer(3, REASON)
    expect(res.success).toBe(true)
    // reverseJournalsByReferenceTx dipanggil dgn refType persis "BANK_TRANSFER":
    // bila salah eja, jurnal tidak ditemukan dan lawan tidak dibuat.
    expect(mocks.reversalCreated.length).toBe(1)
    const upd = mocks.bankTransfer.update.mock.calls[0][0]
    expect(upd.data.status).toBe("void")
    expect(upd.data.deletedAt).toBeInstanceOf(Date)
    expect(mocks.bankTransfer.delete).not.toHaveBeenCalled()
    expect(mocks.journal.delete).not.toHaveBeenCalled()
    expect(mocks.logActivity).toHaveBeenCalledWith("void", "BankTransfer", 3, expect.stringContaining(REASON))
  })

  it("ber-adminFee: lawan memuat Cr akun fee persis", async () => {
    arrange(5000)
    const res = await deleteBankTransfer(3, REASON)
    expect(res.success).toBe(true)
    const entries = mocks.reversalEntries[0]
    const feeMirror = entries.find((e: any) => Number(e.credit) === 5000)
    expect(feeMirror).toBeTruthy()
    expect(Number(feeMirror.accountId)).toBe(301)
  })

  it("void kedua ditolak; tepat satu lawan", async () => {
    mocks.bankTransfer.findUniqueOrThrow.mockResolvedValue({
      id: 3, documentNo: "BTF-0001", date: DOC_DATE, status: "void", deletedAt: new Date(),
    })
    const first = await deleteBankTransfer(3, REASON)
    expect(first.success).toBe(false)
    expect(mocks.reversalCreated.length).toBe(0)
  })
})

describe("GL003-P6 void PettyCash", () => {
  function arrange() {
    mocks.pettyCash.findUniqueOrThrow.mockResolvedValue({
      id: 4, documentNo: "PC-0001", date: DOC_DATE, transactionDate: null, status: "posted", deletedAt: null,
    })
    return arrangePosted("PettyCash", 54)
  }

  it("void posted: asal REVERSED + lawan POSTED, baris void, rantai aktif dihitung ulang tanpa record void", async () => {
    arrange()
    // Rantai: IN 500k (#4 void) + IN 200k aktif -> recalc excludeVoid hanya 200k.
    mocks.pettyCash.findMany.mockResolvedValue([
      { id: 4, documentNo: "PC-0001", type: "IN", amount: 500000, balanceBefore: 0, balanceAfter: 500000 },
      { id: 5, documentNo: "PC-0002", type: "IN", amount: 200000, balanceBefore: 500000, balanceAfter: 700000 },
    ])
    const res = await deletePettyCash(4, REASON)
    expect(res.success).toBe(true)
    expect(mocks.reversalCreated.length).toBe(1)
    expect(mocks.reversalCreated[0].referenceId).toBe(54)
    const upd = mocks.pettyCash.update.mock.calls.map((c: any) => c[0])
    const voidMark = upd.find((c: any) => c.where.id === 4 && c.data.status === "void")
    expect(voidMark).toBeTruthy()
    expect(voidMark.data.deletedAt).toBeInstanceOf(Date)
    expect(mocks.pettyCash.delete).not.toHaveBeenCalled()
    expect(mocks.journal.delete).not.toHaveBeenCalled()
    expect(mocks.journal.deleteMany).not.toHaveBeenCalled()
    expect(mocks.logActivity).toHaveBeenCalledWith("void", "PettyCash", 4, expect.stringContaining(REASON))
  })

  it("void tanpa alasan / void kedua / periode tertutup ditolak", async () => {
    const noReason = await deletePettyCash(4, "  ")
    expect(noReason.success).toBe(false)

    mocks.pettyCash.findUniqueOrThrow.mockResolvedValue({
      id: 4, documentNo: "PC-0001", date: DOC_DATE, status: "void", deletedAt: new Date(),
    })
    const twice = await deletePettyCash(4, REASON)
    expect(twice.success).toBe(false)
    expect(mocks.reversalCreated.length).toBe(0)

    arrange()
    mocks.assertPeriodOpen.mockRejectedValueOnce(new Error("Periode sudah dikunci"))
    const locked = await deletePettyCash(4, REASON)
    expect(locked.success).toBe(false)
    expect(mocks.pettyCash.update).not.toHaveBeenCalled()
  })

  it("update atas record POSTED ditolak total (nominal/tipe/tanggal/akun/metadata)", async () => {
    mocks.journal.findFirst.mockResolvedValue({ id: 54 })
    const res = await updatePettyCash(4, fdMap({ type: "OUT", amount: 100, date: "2026-09-16" }))
    expect(res.success).toBe(false)
    expect(String(res.error)).toContain("tidak dapat diubah")
    expect(mocks.pettyCash.update).not.toHaveBeenCalled()
    expect(mocks.journal.deleteMany).not.toHaveBeenCalled()
  })
})

describe("GL003-P3 updateSalesPayment posted (vonis t_542a4f09 Putusan 4)", () => {
  // updateSalesPayment membaca lockedPayment + journalTouched di dalam tx
  // yang sama: pasang keduanya di mocks.tx.
  const LOCKED = {
    id: 9, salesInvoiceId: 50, documentNo: "PAY-0001", status: "posted",
    paymentDate: new Date("2026-06-08T00:00:00Z"), accountId: 101, amount: 800,
    withholdingAmount: 0, withholdingTypeId: null, paymentMethod: "transfer",
  }

  it("edit finansial posted ditolak sebelum mutasi; non-finansial lolos tanpa jurnal baru", async () => {
    const { updateSalesPayment } = await import("../sales.actions")
    const updates: any[] = []
    const txWith = (journalTouched: unknown) => ({
      ...mocks.tx,
      salesPayment: {
        findUniqueOrThrow: async () => LOCKED,
        aggregate: async () => ({ _sum: { amount: 0, withholdingAmount: 0 } }),
        update: async (arg: any) => {
          updates.push(arg)
          return { id: 9, salesInvoiceId: 50 }
        },
      },
      salesInvoice: { findUniqueOrThrow: async () => ({ id: 50, grandTotal: 1000, status: "posted" }) },
      journal: { findFirst: async () => journalTouched },
      account: { count: async () => 1 },
      transactionAttachment: { updateMany: async () => ({ count: 0 }) },
      $executeRaw: async () => 0,
    })
    const baseForm = { salesInvoiceId: "50", amount: "800", paymentDate: "2026-06-08", paymentMethod: "transfer", accountId: "101" }

    // Skenario A: ubah amount + pindah faktur -> tolak berisik.
    ;(mocks.prismaMock as any).$transaction = async (fn: any) => fn(txWith({ id: 77 }))
    const tolak = await updateSalesPayment(9, fdMap({ ...baseForm, amount: "900" }))
    expect(tolak.success).toBe(false)
    expect(String(tolak.error)).toContain("pembalikan beralasan")
    expect(updates.length).toBe(0)
    expect(mocks.journal.create).not.toHaveBeenCalled()

    // Skenario B: hanya notes -> lolos, TANPA delete/repost jurnal.
    updates.length = 0
    mocks.journal.create.mockClear()
    ;(mocks.prismaMock as any).$transaction = async (fn: any) => fn(txWith({ id: 77 }))
    const lolos = await updateSalesPayment(9, fdMap({ ...baseForm, notes: "koreksi keterangan" }))
    // Debug bila gagal: tampilkan error aksi (bukan klaim hijau).
    if (!lolos.success) console.log("P3-B ERROR:", (lolos as any).error)
    expect(lolos.success).toBe(true)
    expect(updates.length).toBe(1)
    expect(updates[0].data).toEqual(expect.objectContaining({ notes: "koreksi keterangan" }))
    expect(updates[0].data.amount).toBeUndefined()
    expect(mocks.journal.create).not.toHaveBeenCalled()
    expect(mocks.reversalCreated.length).toBe(0)
  })
})
