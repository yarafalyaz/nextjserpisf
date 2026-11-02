import { describe, it, expect, vi, beforeEach } from "vitest"

// Onti F-2026-10-25-017-S/018-V: aksi klaim self-scope + journal routing
// di approveExpense/markExpensePaid. Mock pola expense-approve-order.

const requirePermissionMock = vi.fn()
const revalidateMock = vi.fn()
const getHrScopeMock = vi.fn()
const expenseFindUniqueOrThrowMock = vi.fn()
const expenseFindManyMock = vi.fn()
const expenseFindFirstMock = vi.fn()
const expenseUpdateManyMock = vi.fn()
const expenseCreateMock = vi.fn()
const employeeFindUniqueMock = vi.fn()
const employeeFindFirstMock = vi.fn()
const accountFindFirstMock = vi.fn()
const accountCountMock = vi.fn()
const accountFindUniqueMock = vi.fn()
const attachmentCountMock = vi.fn()
const journalFindFirstMock = vi.fn()
const journalFindManyMock = vi.fn()
const txExpenseUpdateManyMock = vi.fn()
const accrualMock = vi.fn()
const paidMock = vi.fn()
const expenseJournalMock = vi.fn()
const assertApprovedMock = vi.fn()
const syncPettyCashMock = vi.fn()

const txExpenseFindUniqueOrThrowMock = vi.fn()
const txQueryRawMock = vi.fn(async (..._a: unknown[]) => [{ id: 5 }])
const txMock = {
  $executeRaw: vi.fn(async () => 1),
  $queryRaw: (a: unknown) => txQueryRawMock(a),
  expense: {
    findUniqueOrThrow: (...a: unknown[]) => txExpenseFindUniqueOrThrowMock(...a),
    create: (...a: unknown[]) => expenseCreateMock(...a),
    updateMany: (...a: unknown[]) => txExpenseUpdateManyMock(...a),
  },
  employee: {
    findUnique: (...a: unknown[]) => employeeFindUniqueMock(...a),
  },
  journal: { findFirst: (...a: unknown[]) => journalFindFirstMock(...a) },
}

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => requirePermissionMock(...a),
}))
vi.mock("@/lib/auth/hr-scope", () => ({
  getHrScope: (...a: unknown[]) => getHrScopeMock(...a),
  hrScopeWhere: (scope: { kind: string; employeeId?: number; departmentId?: number | null }) => {
    if (scope.kind === "all") return {}
    if (scope.kind === "self") return { employeeId: scope.employeeId }
    if (scope.departmentId == null) return { employeeId: scope.employeeId }
    return { employee: { departmentId: scope.departmentId } }
  },
  assertHrEmployeeAccess: vi.fn(),
}))
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => unknown) => fn(txMock),
    expense: {
      findUniqueOrThrow: (...a: unknown[]) => expenseFindUniqueOrThrowMock(...a),
      findMany: (...a: unknown[]) => expenseFindManyMock(...a),
      findFirst: (...a: unknown[]) => expenseFindFirstMock(...a),
      updateMany: (...a: unknown[]) => expenseUpdateManyMock(...a),
    },
    employee: {
      findUnique: (...a: unknown[]) => employeeFindUniqueMock(...a),
      findFirst: (...a: unknown[]) => employeeFindFirstMock(...a),
    },
    account: {
      findFirst: (...a: unknown[]) => accountFindFirstMock(...a),
      count: (...a: unknown[]) => accountCountMock(...a),
      findUnique: (...a: unknown[]) => accountFindUniqueMock(...a),
    },
    transactionAttachment: {
      count: (...a: unknown[]) => attachmentCountMock(...a),
    },
    journal: {
      findFirst: (...a: unknown[]) => journalFindFirstMock(...a),
      findMany: (...a: unknown[]) => journalFindManyMock(...a),
    },
  },
}))
vi.mock("@/lib/hooks/accounting.hook", () => ({
  onExpenseApproved: (...a: unknown[]) => expenseJournalMock(...a),
  onPettyCashCreated: vi.fn(),
  onReimbursementClaimApproved: (...a: unknown[]) => accrualMock(...a),
  onReimbursementClaimPaid: (...a: unknown[]) => paidMock(...a),
  REIMBURSEMENT_ACCRUAL_REFERENCE_TYPE: "ExpenseReimbursementAccrual",
  REIMBURSEMENT_PAYMENT_REFERENCE_TYPE: "ExpenseReimbursementPayment",
}))
vi.mock("@/lib/hooks/expense.hook", () => ({
  onExpenseApprovedSyncPettyCash: (...a: unknown[]) => syncPettyCashMock(...a),
}))
vi.mock("@/lib/services/approval-workflow.service", () => ({
  requestApprovalIfConfigured: vi.fn(async () => false),
  assertApproved: (...a: unknown[]) => assertApprovedMock(...a),
}))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: vi.fn() }))
vi.mock("@/lib/services/period-lock.service", () => ({ assertPeriodOpen: vi.fn() }))
vi.mock("@/lib/services/transaction-attachment.service", () => ({
  attachPendingTransactionAttachments: vi.fn(),
  deleteTransactionAttachmentsTx: vi.fn(),
  removeAttachmentFiles: vi.fn(),
}))
vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: vi.fn(async () => "EXP-0001"),
}))
vi.mock("@/lib/utils/idempotency", () => ({ checkIdempotency: vi.fn() }))
vi.mock("@/lib/utils/slug-db", () => ({ nextSlug: vi.fn(async () => "exp-0001") }))
vi.mock("@/lib/finance/petty-cash-chain", () => ({
  computePettyCashChain: vi.fn(),
  findFirstNegativeBalance: vi.fn(),
}))
vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => revalidateMock(...a),
}))

import { approveExpense, markExpensePaid } from "../finance.actions"
import { createReimbursementClaim, getMyReimbursementClaims, setReimbursementClaimAccounts } from "../reimbursement.actions"

function form(entries: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(entries)) fd.set(k, v)
  return fd
}

const CLAIM = {
  id: 42, status: "draft", documentNo: "EXP-0042",
  isReimbursementClaim: true, employeeId: 5, accountId: 610,
  referenceNo: "NOTA-1", receiptImage: "/nota.jpg", amount: 150000,
}

beforeEach(() => {
  vi.clearAllMocks()
  requirePermissionMock.mockResolvedValue({ id: 7, roles: ["karyawan"] })
  assertApprovedMock.mockResolvedValue(undefined)
  syncPettyCashMock.mockResolvedValue(undefined)
  accrualMock.mockResolvedValue(undefined)
  paidMock.mockResolvedValue(undefined)
  expenseJournalMock.mockResolvedValue(undefined)
  expenseUpdateManyMock.mockResolvedValue({ count: 1 })
  // R8-KEU-05: approve membaca expense dua kali — luar (gerbang klaim) dan
  // di dalam tx bersama sync; baca dalam tx jatuh ke fixture klaim draft.
  txExpenseFindUniqueOrThrowMock.mockResolvedValue({ ...CLAIM })
  txExpenseUpdateManyMock.mockResolvedValue({ count: 1 })
  attachmentCountMock.mockResolvedValue(1)
  employeeFindFirstMock.mockResolvedValue(null) // approver bukan karyawan tertaut
  // Gerbang pengaju (putaran 47): default pengaju hidup dan belum berhenti.
  employeeFindUniqueMock.mockResolvedValue({ id: 5, isActive: true, deletedAt: null, employmentEndedAt: null })
  journalFindFirstMock.mockResolvedValue({ totalDebit: 150000 })
  // FINHR-8 default: akun beban klaim valid EXPENSE aktif.
  accountFindUniqueMock.mockResolvedValue({ type: "EXPENSE", isActive: true, deletedAt: null })
})

describe("approveExpense klaim (AC-RB-B3/B4, E-RB5-1)", () => {
  it("klaim tanpa bukti ditolak, status tidak berubah", async () => {
    expenseFindUniqueOrThrowMock.mockResolvedValue({ ...CLAIM })
    attachmentCountMock.mockResolvedValue(0)
    expenseFindUniqueOrThrowMock.mockResolvedValue({ ...CLAIM, receiptImage: null })
    const r = await approveExpense(42)
    expect(r.success).toBe(false)
    expect(accrualMock).not.toHaveBeenCalled()
    expect(expenseUpdateManyMock).not.toHaveBeenCalled()
  })

  it("self-approve klaim ditolak (BR-RB-07)", async () => {
    expenseFindUniqueOrThrowMock.mockResolvedValue({ ...CLAIM })
    employeeFindFirstMock.mockResolvedValue({ id: 5 })
    const r = await approveExpense(42)
    expect(r.success).toBe(false)
    expect(accrualMock).not.toHaveBeenCalled()
  })

  it("klaim sah: J-RB1 diposting, bukan jurnal Expense existing", async () => {
    expenseFindUniqueOrThrowMock.mockResolvedValue({ ...CLAIM })
    const r = await approveExpense(42)
    expect(r.success).toBe(true)
    expect(accrualMock).toHaveBeenCalledWith(42, 7, expect.anything())
  })

  it("FINHR-8: approve klaim dengan akun beban non-EXPENSE ditolak sebelum jurnal", async () => {
    expenseFindUniqueOrThrowMock.mockResolvedValue({ ...CLAIM })
    accountFindUniqueMock.mockResolvedValue({ type: "ASSET", isActive: true, deletedAt: null })
    const r = await approveExpense(42)
    expect(r.success).toBe(false)
    expect(accrualMock).not.toHaveBeenCalled()
  })

  it("regresi putaran 47: pengaju sudah berhenti/nonaktif/terhapus — approve ditolak, nol akrual", async () => {
    expenseFindUniqueOrThrowMock.mockResolvedValue({ ...CLAIM })
    employeeFindUniqueMock.mockResolvedValue({
      id: 5, isActive: false, deletedAt: null, employmentEndedAt: new Date("2026-10-20"),
    })
    const r = await approveExpense(42)
    expect(r.success).toBe(false)
    expect(accrualMock).not.toHaveBeenCalled()
    expect(txExpenseUpdateManyMock).not.toHaveBeenCalled()
  })

  it("Expense non-klaim: perilaku existing utuh (nol gerbang klaim)", async () => {
    expenseFindUniqueOrThrowMock.mockResolvedValue({
      ...CLAIM, isReimbursementClaim: false, employeeId: null,
      referenceNo: null, receiptImage: null,
    })
    attachmentCountMock.mockResolvedValue(0)
    const r = await approveExpense(42)
    expect(r.success).toBe(true)
    expect(accrualMock).not.toHaveBeenCalled()
    expect(txExpenseUpdateManyMock).toHaveBeenCalled()
  })
})

describe("setReimbursementClaimAccounts validasi akun final (FINHR-8)", () => {
  beforeEach(() => {
    expenseFindUniqueOrThrowMock.mockResolvedValue({ ...CLAIM })
  })

  it("akun beban EXPENSE aktif diterima", async () => {
    accountFindUniqueMock.mockResolvedValue({ type: "EXPENSE", isActive: true, deletedAt: null })
    const r = await setReimbursementClaimAccounts(42, form({ accountId: "610" }))
    expect(r.success).toBe(true)
    expect(expenseUpdateManyMock).toHaveBeenCalled()
  })

  it("akun beban non-EXPENSE ditolak", async () => {
    accountFindUniqueMock.mockResolvedValue({ type: "ASSET", isActive: true, deletedAt: null })
    const r = await setReimbursementClaimAccounts(42, form({ accountId: "610" }))
    expect(r.success).toBe(false)
    expect(expenseUpdateManyMock).not.toHaveBeenCalled()
  })

  it("akun beban nonaktif ditolak", async () => {
    accountFindUniqueMock.mockResolvedValue({ type: "EXPENSE", isActive: false, deletedAt: null })
    const r = await setReimbursementClaimAccounts(42, form({ accountId: "610" }))
    expect(r.success).toBe(false)
    expect(expenseUpdateManyMock).not.toHaveBeenCalled()
  })

  it("akun bayar non-ASSET ditolak", async () => {
    accountFindUniqueMock
      .mockResolvedValueOnce({ type: "EXPENSE", isActive: true, deletedAt: null })
      .mockResolvedValueOnce({ type: "EXPENSE", isActive: true, deletedAt: null })
    const r = await setReimbursementClaimAccounts(
      42,
      form({ accountId: "610", paidFromAccountId: "620" }),
    )
    expect(r.success).toBe(false)
    expect(expenseUpdateManyMock).not.toHaveBeenCalled()
  })
})

describe("createReimbursementClaim self-scope (AC-RB-B1/B6)", () => {
  it("employeeId payload karyawan lain ditimpa scope self", async () => {
    getHrScopeMock.mockResolvedValue({ kind: "self", employeeId: 5 })
    employeeFindUniqueMock.mockResolvedValue({ id: 5, isActive: true, deletedAt: null, employmentEndedAt: null })
    accountFindFirstMock.mockResolvedValue({ id: 610 })
    expenseFindManyMock.mockResolvedValue([])
    expenseCreateMock.mockResolvedValue({ id: 99, documentNo: "EXP-0001" })
    const r = await createReimbursementClaim(form({
      employeeId: "999", amount: "150000", date: "2026-10-25",
      referenceNo: "NOTA-1", description: "Bensin antar kendaraan",
    }))
    expect(r.success).toBe(true)
    const data = expenseCreateMock.mock.calls[0][0].data
    expect(data.employeeId).toBe(5)
    expect(data.isReimbursementClaim).toBe(true)
    expect(data.paidFromAccountId).toBeNull()
  })

  it("kandidat dobel tanpa pengakuan = peringatan MERAH berisi kandidat", async () => {
    getHrScopeMock.mockResolvedValue({ kind: "self", employeeId: 5 })
    employeeFindUniqueMock.mockResolvedValue({ id: 5, employmentEndedAt: null })
    accountFindFirstMock.mockResolvedValue({ id: 610 })
    expenseFindManyMock.mockResolvedValue([{
      id: 1, documentNo: "EXP-0001", employeeId: 5,
      date: new Date("2026-10-25T00:00:00.000Z"), amount: 150000,
      referenceNo: "NOTA-1", status: "draft",
    }])
    const r = await createReimbursementClaim(form({
      amount: "150000", date: "2026-10-25", referenceNo: "NOTA-1",
    }))
    expect(r.success).toBe(false)
    expect((r as { duplicateCandidates?: unknown[] }).duplicateCandidates).toHaveLength(1)
    expect(expenseCreateMock).not.toHaveBeenCalled()
  })

  it("putaran 68: pengaju yang berhenti di antara cek luar dan tx ditolak dari bacaan terkunci, tanpa klaim", async () => {
    getHrScopeMock.mockResolvedValue({ kind: "self", employeeId: 5 })
    // Cek luar (bacaan pertama) masih melihat karyawan aktif; penilaian
    // ulang dalam tx (bacaan kedua, sesudah kunci baris employee) melihat
    // employmentEndedAt yang baru commit.
    employeeFindUniqueMock
      .mockResolvedValueOnce({ id: 5, employmentEndedAt: null })
      .mockResolvedValueOnce({
        id: 5, isActive: true, deletedAt: null, employmentEndedAt: new Date("2026-11-01"),
      })
    accountFindFirstMock.mockResolvedValue({ id: 610 })
    expenseFindManyMock.mockResolvedValue([])
    const r = await createReimbursementClaim(form({
      amount: "150000", date: "2026-10-25",
    }))
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/sudah nonaktif/)
    expect(expenseCreateMock).not.toHaveBeenCalled()
    expect(txQueryRawMock).toHaveBeenCalled()
    expect(txQueryRawMock.mock.invocationCallOrder[0]).toBeLessThan(
      employeeFindUniqueMock.mock.invocationCallOrder[1],
    )
  })

  it("user tanpa karyawan tertaut ditolak fail-closed", async () => {
    getHrScopeMock.mockResolvedValue({ kind: "self", employeeId: -1 })
    const r = await createReimbursementClaim(form({
      amount: "150000", date: "2026-10-25",
    }))
    expect(r.success).toBe(false)
    expect(expenseCreateMock).not.toHaveBeenCalled()
  })
})

describe("markExpensePaid klaim (E-RB5-2)", () => {
  it("klaim dibayar lewat J-RB2, jurnal Expense existing TIDAK dipanggil", async () => {
    txExpenseFindUniqueOrThrowMock.mockResolvedValue({
      ...CLAIM, status: "approved", paidFromAccountId: 100,
    })
    const r = await markExpensePaid(42)
    expect(r.success).toBe(true)
    expect(paidMock).toHaveBeenCalledWith(42, 7, expect.anything())
    expect(expenseJournalMock).not.toHaveBeenCalled()
  })

  it("regresi putaran 47: pengaju berhenti sesudah approve — bayar ditolak, nol J-RB2", async () => {
    txExpenseFindUniqueOrThrowMock.mockResolvedValue({
      ...CLAIM, status: "approved", paidFromAccountId: 100,
    })
    employeeFindUniqueMock.mockResolvedValue({
      id: 5, isActive: true, deletedAt: null, employmentEndedAt: new Date("2026-10-28"),
    })
    const r = await markExpensePaid(42)
    expect(r.success).toBe(false)
    expect(paidMock).not.toHaveBeenCalled()
    expect(txExpenseUpdateManyMock).not.toHaveBeenCalled()
  })

  it("non-klaim tetap jurnal existing", async () => {
    txExpenseFindUniqueOrThrowMock.mockResolvedValue({
      ...CLAIM, status: "approved", paidFromAccountId: 100, isReimbursementClaim: false,
    })
    const r = await markExpensePaid(42)
    expect(r.success).toBe(true)
    expect(expenseJournalMock).toHaveBeenCalled()
    expect(paidMock).not.toHaveBeenCalled()
  })

  it("(b) hanya J-RB1 soft-deleted (query aktif kosong) -> bayar ditolak, nol J-RB2", async () => {
    txExpenseFindUniqueOrThrowMock.mockResolvedValue({
      ...CLAIM, status: "approved", paidFromAccountId: 100,
    })
    journalFindFirstMock.mockResolvedValue(null)
    const r = await markExpensePaid(42)
    expect(r.success).toBe(false)
    expect(paidMock).not.toHaveBeenCalled()
    expect(txExpenseUpdateManyMock).not.toHaveBeenCalled()
    const where = journalFindFirstMock.mock.calls.at(-1)?.[0]?.where
    expect(where.status).toEqual({ not: "REVERSED" })
    expect(where.deletedAt).toBeNull()
  })

  it("(d) hanya J-RB1 REVERSED (query aktif kosong) -> bayar ditolak, nol J-RB2", async () => {
    txExpenseFindUniqueOrThrowMock.mockResolvedValue({
      ...CLAIM, status: "approved", paidFromAccountId: 100,
    })
    journalFindFirstMock.mockResolvedValue(null)
    const r = await markExpensePaid(42)
    expect(r.success).toBe(false)
    expect(paidMock).not.toHaveBeenCalled()
    const where = journalFindFirstMock.mock.calls.at(-1)?.[0]?.where
    expect(where.status).toEqual({ not: "REVERSED" })
    expect(where.deletedAt).toBeNull()
  })
})

describe("getMyReimbursementClaims tahap jurnal aktif (t_b228bac8)", () => {
  it("klaim paid dengan hanya J-RB2 REVERSED -> tahap BUKAN Dibayar", async () => {
    getHrScopeMock.mockResolvedValue({ kind: "self", employeeId: 5 })
    expenseFindManyMock.mockResolvedValue([{
      ...CLAIM, status: "paid",
      category: { label: "Transport" }, employee: { name: "Budi" },
    }])
    // DB nyata menyaring J-RB2 REVERSED keluar; loader hanya menerima jurnal aktif.
    journalFindManyMock.mockResolvedValue([])
    const r = await getMyReimbursementClaims()
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data[0].stage).not.toBe("DIBAYAR")
      expect(r.data[0].hasPaymentJournal).toBe(false)
    }
    const where = journalFindManyMock.mock.calls.at(-1)?.[0]?.where
    expect(where.status).toEqual({ not: "REVERSED" })
    expect(where.deletedAt).toBeNull()
  })
})
