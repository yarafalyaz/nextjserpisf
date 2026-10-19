import { expect, vi } from "vitest"

/**
 * Fixture bersama guard tes finance (bankstatement header lock, recon
 * match, concurrency lock). Mock modul (`vi.mock`) tetap di tiap berkas
 * tes karena hoisting Vitest; helper ini hanya membangun mock Prisma,
 * seed baris/rekonsiliasi, dan perekam urutan lock, supaya bentuk yang
 * sama tidak disalin antar berkas.
 */

function buildFinanceModelMock() {
  return {
    findFirst: vi.fn().mockResolvedValue(null),
    findUnique: vi.fn().mockResolvedValue(null),
    findUniqueOrThrow: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: 1 }),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
    aggregate: vi.fn().mockResolvedValue({ _sum: {} }),
  }
}

export interface FinanceGuardHolder {
  guards: FinanceGuardMocks
  models: readonly string[]
}

/** Pasangan mock yang selalu dicek guard lock: lock jalan + urutan persis. */
export function expectLockOrder(
  order: string[],
  expected: string[],
  lockMock?: any,
) {
  if (lockMock) expect(lockMock).toHaveBeenCalled()
  expect(order).toEqual(expected)
}

export interface FinanceGuardMocks {
  requirePermissionMock: any
  assertPeriodOpenMock: any
  prismaMock: any
  revalidateMock: any
  logActivityMock: any
}

/**
 * Objek mock untuk `vi.hoisted(...)` di berkas tes: satu `prismaMock`
 * dipakai bersama callback `$transaction`, jadi `$executeRaw` (lock
 * baris/rekonsiliasi) dan `$queryRaw` (lock header) berbagi rekaman.
 */
export function buildFinanceGuardMocks(
  modelNames: readonly string[],
): FinanceGuardMocks {
  const prismaMock: any = {}
  for (const name of modelNames) prismaMock[name] = buildFinanceModelMock()
  prismaMock.$transaction = vi.fn(async (cb: any) =>
    typeof cb === "function" ? cb(prismaMock) : Promise.all(cb),
  )
  prismaMock.$executeRaw = vi.fn().mockResolvedValue(0)
  prismaMock.$queryRaw = vi.fn().mockResolvedValue([])
  return {
    requirePermissionMock: vi.fn(),
    assertPeriodOpenMock: vi.fn(),
    prismaMock,
    revalidateMock: vi.fn(),
    logActivityMock: vi.fn(),
  }
}

export function resetMockFns(mocks: readonly any[]) {
  for (const m of mocks) m.mockReset()
}

/** Reset semua model + raw + izin/periode ke default sebelum tiap tes. */
export function resetFinanceGuardMocks(mocks: FinanceGuardMocks) {
  for (const m of Object.values(mocks.prismaMock) as any[]) {
    if (!m || typeof m !== "object" || !m.findFirst) continue
    m.findFirst.mockReset().mockResolvedValue(null)
    m.findUnique.mockReset().mockResolvedValue(null)
    m.findUniqueOrThrow.mockReset().mockResolvedValue(null)
    m.findMany.mockReset().mockResolvedValue([])
    m.create.mockReset().mockResolvedValue({ id: 1 })
    m.update.mockReset().mockResolvedValue({})
    m.delete.mockReset().mockResolvedValue({})
    m.aggregate.mockReset().mockResolvedValue({ _sum: {} })
  }
  mocks.prismaMock.$transaction
    .mockReset()
    .mockImplementation(async (cb: any) =>
      typeof cb === "function" ? cb(mocks.prismaMock) : Promise.all(cb),
    )
  mocks.prismaMock.$executeRaw.mockReset().mockResolvedValue(0)
  mocks.prismaMock.$queryRaw.mockReset().mockResolvedValue([])
  mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
  mocks.assertPeriodOpenMock.mockReset().mockResolvedValue({})
}

function buildFormData(
  payload: Record<string, string | number>,
): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(payload)) f.append(k, String(v))
  return f
}

/** Payload form update baris bank statement yang dipakai banyak guard. */
export function bankStatementLineForm(
  overrides: Record<string, string | number> = {},
): FormData {
  return buildFormData({
    bankStatementId: 3,
    date: "2026-07-01",
    amount: "900",
    type: "credit",
    ...overrides,
  })
}

/** Baris bank statement hasil baca ulang di dalam transaksi. */
export function bankLineReadFixture(overrides: Record<string, any> = {}) {
  return {
    id: 11,
    bankStatementId: 3,
    date: new Date("2026-06-01"),
    ...overrides,
  }
}

/** Seed item rekonsiliasi yang menunjuk rekonsiliasi 9. */
export function seedReconItems(prismaMock: any) {
  prismaMock.bankReconciliationItem.findMany.mockResolvedValue([
    { bankReconciliationId: 9 },
  ])
}

export function matchLineFixture(overrides: Record<string, any> = {}) {
  return {
    date: new Date("2026-06-01"),
    amount: 1000,
    type: "debit",
    debit: 1000,
    credit: 0,
    bankStatement: { accountId: 10 },
    ...overrides,
  }
}

export function matchEntryFixture(overrides: Record<string, any> = {}) {
  return {
    accountId: 10,
    debit: 1000,
    credit: 0,
    journal: {
      status: "POSTED",
      deletedAt: null,
      transactionDate: new Date("2026-06-02"),
    },
    ...overrides,
  }
}

/** Wire seed match yang lolos semua guard R-03. */
export function wireMatchOk(prismaMock: any, line: any, entry: any) {
  prismaMock.bankReconciliation.findUniqueOrThrow.mockResolvedValue({
    status: "draft",
    accountId: 10,
    periodStart: null,
    periodEnd: null,
  })
  prismaMock.bankStatementLine.findUniqueOrThrow.mockResolvedValue(line)
  prismaMock.journalEntry.findUniqueOrThrow.mockResolvedValue(entry)
  // reuse-check default: tidak dipakai
  prismaMock.bankReconciliationItem.findFirst.mockResolvedValue(null)
}

/**
 * Rekam urutan lintas mock untuk guard header: lock baris / lock header /
 * lock rekonsiliasi / tulis baris / recalc (aggregate header). Mengembalikan
 * juga id + SQL lock header persis seperti diteruskan ke `$queryRaw`.
 */
export function recordBankStatementLineOrder(
  prismaMock: any,
  assertPeriodOpenMock?: any,
) {
  const order: string[] = []
  const headerLockIds: number[][] = []
  const headerLockSql: string[] = []

  if (assertPeriodOpenMock) {
    const origAssert = assertPeriodOpenMock.getMockImplementation()
    assertPeriodOpenMock.mockImplementation(async (...a: any[]) => {
      order.push("period-assert")
      return origAssert ? origAssert(...a) : undefined
    })
  }

  prismaMock.$executeRaw.mockImplementation(async (strings: any) => {
    const sql = String(strings?.[0] ?? "")
    if (sql.includes("bank_statement_lines")) order.push("lock-line")
    else if (sql.includes("bank_reconciliations")) order.push("lock-recon")
    else order.push(`exec:${sql}`)
    return 0
  })

  prismaMock.$queryRaw.mockImplementation(
    async (strings: any, ...values: any[]) => {
      const sql = (strings as unknown as string[]).join("?")
      // Prisma.join([a, b]) tiba sebagai satu Sql dengan values [a, b];
      // ratakan agar daftar id yang dikunci bisa diperiksa persis.
      const flat = values.flatMap((v: any) =>
        v && Array.isArray(v.values) ? v.values : [v],
      )
      order.push("lock-header")
      headerLockSql.push(sql)
      headerLockIds.push(flat)
      return []
    },
  )

  const line = prismaMock.bankStatementLine
  const wrap = (mockFn: any, label: string, fallback: any) => {
    const orig = mockFn.getMockImplementation()
    mockFn.mockImplementation(async (...a: any[]) => {
      order.push(label)
      return orig ? orig(...a) : fallback
    })
  }
  wrap(line.create, "create-line", { id: 1 })
  wrap(line.update, "update-line", {})
  wrap(line.delete, "delete-line", {})
  wrap(line.aggregate, "recalc", { _sum: {} })

  return { order, headerLockIds, headerLockSql }
}

/**
 * Rekam urutan lock vs baca ulang vs cek completedMatch untuk guard
 * induk rekonsiliasi: `$executeRaw` membedakan lock baris vs lock induk,
 * `$queryRaw` adalah lock header R-12 di antaranya.
 */
export function recordReconLockOrder(
  prismaMock: any,
  order: string[],
  lineReadMock: any,
  withCheck = false,
) {
  const txExec = prismaMock.$executeRaw
  const origExec = txExec.getMockImplementation()
  txExec.mockImplementation(async (...a: any[]) => {
    const sql = String(a[0]?.[0] ?? a[0] ?? "")
    order.push(sql.includes("bank_statement_lines") ? "lock-line" : "lock-parent")
    return origExec ? origExec(...a) : 0
  })
  prismaMock.$queryRaw.mockImplementation(async () => {
    order.push("lock-header")
    return []
  })
  const origRead = lineReadMock.getMockImplementation()
  lineReadMock.mockImplementation(async (...a: any[]) => {
    order.push("reread-line")
    return origRead ? origRead(...a) : bankLineReadFixture()
  })
  if (withCheck) {
    prismaMock.bankReconciliationItem.findFirst.mockImplementation(async () => {
      order.push("check")
      return null
    })
  }
}

/** Skenario update baris header-sama/pindah untuk guard R-12. */
export async function runUpdateLineScenario(
  prismaMock: any,
  updateFn: (id: number, form: FormData) => Promise<any>,
  lineFixture: Record<string, any>,
  assertPeriodOpenMock?: any,
) {
  prismaMock.bankStatementLine.findUniqueOrThrow.mockResolvedValue(lineFixture)
  seedReconItems(prismaMock)
  const recorded = recordBankStatementLineOrder(prismaMock, assertPeriodOpenMock)
  const res = await updateFn(11, bankStatementLineForm())
  return { ...recorded, res }
}

function balancedJournalEntriesFixture() {
  return [
    { id: 1, journalId: 7, accountId: 100, debit: 500, credit: 0 },
    { id: 2, journalId: 7, accountId: 200, debit: 0, credit: 500 },
  ]
}

function balancedReconItemsFixture() {
  return [
    { id: 1, matched: true, cleared: true, bankStatementLineId: 1, journalEntryId: 1, type: "match", amount: 1000 },
  ]
}

export function journalDraftFixture(overrides: Record<string, any> = {}) {
  return {
    id: 7,
    status: "DRAFT",
    transactionDate: new Date("2026-06-01"),
    entries: balancedJournalEntriesFixture(),
    ...overrides,
  }
}

export function reconDraftFixture(overrides: Record<string, any> = {}) {
  return {
    id: 9,
    status: "draft",
    bookBalance: 1000,
    statementBalance: 1000,
    items: balancedReconItemsFixture(),
    ...overrides,
  }
}

/**
 * Objek `tx` untuk guard concurrency: `$executeRaw` mencatat "lock",
 * baca ulang model mencatat "reread", klaim `updateMany` mencatat "claim".
 */
export function buildLockTx(opts: {
  order: string[]
  executeRaw: (...a: any[]) => unknown
  modelName: string
  findUniqueOrThrow: (...a: any[]) => unknown
  updateMany: (...a: any[]) => unknown
  extra?: Record<string, any>
}) {
  return {
    $executeRaw: (...a: any[]) => {
      opts.order.push("lock")
      return opts.executeRaw(...a)
    },
    [opts.modelName]: {
      findUniqueOrThrow: (...a: any[]) => {
        opts.order.push("reread")
        return opts.findUniqueOrThrow(...a)
      },
      updateMany: (...a: any[]) => {
        opts.order.push("claim")
        return opts.updateMany(...a)
      },
    },
    ...opts.extra,
  }
}

