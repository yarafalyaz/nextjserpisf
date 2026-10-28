import { describe, expect, it, vi } from "vitest"
import {
  assertMaterialIssueStockOutOnce,
  assertSalesInvoiceStockOutOnce,
  findStockOutConflicts,
  lockStockOutQuotationsTx,
} from "../stock-out-once.service"

/**
 * SAL-BR-014: satu kebutuhan material pada pohon quotation yang sama
 * hanya boleh mengurangi stok satu kali — lewat faktur penjualan ATAU
 * pengeluaran material proyek, bukan keduanya.
 *
 * Mock tx berbentuk pohon fixture: quotation 10 -> WO 20 (project 30)
 * -> MI 40; quotation 10 -> SO 50 -> faktur 60. Item 7 = material sama.
 */

type Row = Record<string, unknown>

function matches(row: Row, where: Row): boolean {
  for (const [key, cond] of Object.entries(where)) {
    if (key === "deletedAt") continue
    const val = row[key]
    if (cond !== null && typeof cond === "object" && !Array.isArray(cond)) {
      const c = cond as Row
      if ("in" in c) {
        if (!(c.in as unknown[]).includes(val)) return false
      } else if ("gt" in c) {
        if (!(Number(val) > Number(c.gt))) return false
      } else if ("not" in c) {
        if (val === c.not) return false
      } else {
        return false
      }
    } else if (val !== cond) {
      return false
    }
  }
  return true
}

function delegate(rows: Row[]) {
  return {
    findUnique: vi.fn(async ({ where }: { where: Row }) => {
      const found = rows.find((r) => matches(r, where))
      return found ?? null
    }),
    findMany: vi.fn(async ({ where }: { where?: Row } = {}) =>
      rows.filter((r) => !where || matches(r, where)),
    ),
  }
}

function buildTx(fixture: {
  moves?: Row[]
  invoices?: Row[]
  issues?: Row[]
}) {
  const salesInvoices: Row[] = fixture.invoices ?? [
    { id: 60, quotationId: 10, salesOrderId: 50, projectId: null, deletedAt: null },
  ]
  const materialIssues: Row[] = fixture.issues ?? [
    { id: 40, workOrderId: 20, projectId: 30 },
  ]
  // Semua raw query yang dijalankan guard, berurutan — dipakai tes urutan
  // serialisasi (kunci quotation WAJIB mendahului baca stock_moves).
  const calls: string[] = []
  const queryRaw = vi.fn(
    async (
      query: { strings?: readonly string[]; values?: unknown[] } | readonly string[],
      ...inlineValues: unknown[]
    ) => {
      const strings =
        (query as { strings?: readonly string[] }).strings ??
        (query as readonly string[])
      const values =
        (query as { values?: unknown[] }).values ?? inlineValues
      const sqlText = Array.from(strings).join("?")
      calls.push(sqlText)
      if (/FROM\s+quotations/i.test(sqlText)) {
        return values[0] ?? []
      }
      if (/FROM\s+stock_moves/i.test(sqlText)) {
        const [referenceType, ...rest] = values
        const ids = rest.flat().map(Number)
        return (fixture.moves ?? [])
          .filter(
            (m) =>
              m.referenceType === referenceType &&
              ids.includes(Number(m.referenceId)) &&
              m.impact === "OUT" &&
              m.status === "posted",
          )
          .map((m) => ({ itemId: m.itemId, qty: m.qty, documentNo: m.documentNo }))
      }
      return []
    },
  )
  const tx = {
    $queryRaw: queryRaw,
    salesInvoice: delegate(salesInvoices),
    salesOrder: delegate([{ id: 50, quotationId: 10, deletedAt: null }]),
    workOrder: delegate([{ id: 20, quotationId: 10, projectId: 30 }]),
    project: delegate([{ id: 30, contractQuotationId: 10 }]),
    materialIssue: delegate(materialIssues),
    stockMove: delegate(fixture.moves ?? []),
    __calls: calls,
  }
  return tx as never
}

function rawCalls(tx: unknown): string[] {
  return (tx as { __calls: string[] }).__calls
}

const miMovePosted = {
  referenceType: "MaterialIssue",
  referenceId: 40,
  itemId: 7,
  qty: 3,
  impact: "OUT",
  status: "posted",
  documentNo: "SM-0001",
}
const salesMovePosted = {
  referenceType: "SalesInvoice",
  referenceId: 60,
  itemId: 7,
  qty: 3,
  impact: "OUT",
  status: "posted",
  documentNo: "SM-0002",
}

describe("stock-out-once.service (SAL-BR-014)", () => {
  it("arah penjualan: MI posted pada pohon sama -> konflik item sama", async () => {
    const tx = buildTx({ moves: [miMovePosted] })
    const conflicts = await findStockOutConflicts(tx, {
      candidateKind: "SalesInvoice",
      candidateLines: [{ itemId: 7, qty: 3 }],
      sharedQuotationId: 10,
      excludeSalesInvoiceId: 60,
    })
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]).toMatchObject({
      itemId: 7,
      alreadyOutQty: 3,
      sourceKind: "MaterialIssue",
      sourceDocumentNo: "SM-0001",
    })
  })

  it("arah material: faktur posted pada pohon sama -> konflik item sama", async () => {
    const tx = buildTx({ moves: [salesMovePosted] })
    const conflicts = await findStockOutConflicts(tx, {
      candidateKind: "MaterialIssue",
      candidateLines: [{ itemId: 7, qty: 2 }],
      sharedQuotationId: 10,
      excludeMaterialIssueId: 40,
    })
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].sourceKind).toBe("SalesInvoice")
  })

  it("tanpa pohon bersama (quotation null) -> tanpa konflik", async () => {
    const tx = buildTx({ moves: [miMovePosted] })
    const conflicts = await findStockOutConflicts(tx, {
      candidateKind: "SalesInvoice",
      candidateLines: [{ itemId: 7, qty: 3 }],
      sharedQuotationId: null,
    })
    expect(conflicts).toEqual([])
  })

  it("item berbeda -> tanpa konflik", async () => {
    const tx = buildTx({ moves: [miMovePosted] })
    const conflicts = await findStockOutConflicts(tx, {
      candidateKind: "SalesInvoice",
      candidateLines: [{ itemId: 8, qty: 3 }],
      sharedQuotationId: 10,
      excludeSalesInvoiceId: 60,
    })
    expect(conflicts).toEqual([])
  })

  it("move lawan reversed -> tidak dihitung, pengeluaran pengganti sah", async () => {
    const tx = buildTx({ moves: [{ ...miMovePosted, status: "reversed" }] })
    const conflicts = await findStockOutConflicts(tx, {
      candidateKind: "SalesInvoice",
      candidateLines: [{ itemId: 7, qty: 3 }],
      sharedQuotationId: 10,
      excludeSalesInvoiceId: 60,
    })
    expect(conflicts).toEqual([])
  })

  it("dokumen kandidat sendiri dikecualikan (re-post idempoten aman)", async () => {
    const tx = buildTx({
      moves: [{ ...salesMovePosted, referenceType: "MaterialIssue", referenceId: 40 }],
      issues: [{ id: 40, workOrderId: 20, projectId: 30 }],
    })
    // Kandidat MI 40 melawan MI lain: satu-satunya move MI adalah miliknya.
    const conflicts = await findStockOutConflicts(tx, {
      candidateKind: "SalesInvoice",
      candidateLines: [{ itemId: 7, qty: 3 }],
      sharedQuotationId: 10,
      excludeSalesInvoiceId: 60,
    })
    // Move MI 40 tetap lawan sah bagi faktur -> konflik (bukan dirinya).
    expect(conflicts).toHaveLength(1)
    const ownTx = buildTx({ moves: [miMovePosted] })
    const ownConflicts = await findStockOutConflicts(ownTx, {
      candidateKind: "MaterialIssue",
      candidateLines: [{ itemId: 7, qty: 3 }],
      sharedQuotationId: 10,
      excludeMaterialIssueId: 40,
    })
    // Lawan bagi MI adalah faktur; move MI sendiri tidak menghalangi MI.
    expect(ownConflicts).toEqual([])
  })

  it("assert penjualan: konflik -> throw SAL-BR-014 fail-closed", async () => {
    const tx = buildTx({ moves: [miMovePosted] })
    await expect(
      assertSalesInvoiceStockOutOnce(tx, 60, [{ itemId: 7, qty: 3 }]),
    ).rejects.toThrow(/SAL-BR-014/)
  })

  it("assert material: konflik -> throw SAL-BR-014 fail-closed", async () => {
    const tx = buildTx({ moves: [salesMovePosted] })
    await expect(
      assertMaterialIssueStockOutOnce(tx, 40, [{ itemId: 7, qty: 3 }]),
    ).rejects.toThrow(/SAL-BR-014/)
  })

  it("assert penjualan: tanpa move lawan -> lolos", async () => {
    const tx = buildTx({ moves: [] })
    await expect(
      assertSalesInvoiceStockOutOnce(tx, 60, [{ itemId: 7, qty: 3 }]),
    ).resolves.toBeUndefined()
  })

  it("assert material: faktur tanpa jembatan quotation sama -> lolos", async () => {
    const tx = buildTx({
      moves: [salesMovePosted],
      invoices: [
        { id: 60, quotationId: 99, salesOrderId: null, projectId: null, deletedAt: null },
      ],
    })
    await expect(
      assertMaterialIssueStockOutOnce(tx, 40, [{ itemId: 7, qty: 3 }]),
    ).resolves.toBeUndefined()
  })

  it("qty kandidat agregat per item (baris duplikat digabung)", async () => {
    const tx = buildTx({ moves: [miMovePosted] })
    const conflicts = await findStockOutConflicts(tx, {
      candidateKind: "SalesInvoice",
      candidateLines: [
        { itemId: 7, qty: 1 },
        { itemId: 7, qty: 2 },
      ],
      sharedQuotationId: 10,
      excludeSalesInvoiceId: 60,
    })
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].candidateQty).toBe(3)
  })

  it("serialisasi: kunci baris quotation diperoleh SEBELUM baca move lawan (jalur penjualan)", async () => {
    const tx = buildTx({ moves: [miMovePosted] })
    await expect(
      assertSalesInvoiceStockOutOnce(tx, 60, [{ itemId: 7, qty: 3 }]),
    ).rejects.toThrow(/SAL-BR-014/)

    const calls = rawCalls(tx)
    const lockIdx = calls.findIndex((sql) => /FROM\s+quotations/i.test(sql))
    const readIdx = calls.findIndex((sql) => /FROM\s+stock_moves/i.test(sql))
    expect(lockIdx).toBeGreaterThanOrEqual(0)
    expect(readIdx).toBeGreaterThanOrEqual(0)
    // Kunci bersama WAJIB mendahului guard: bila urutan ini dibalik,
    // dua posting konkuren membaca snapshot lama dan sama-sama lolos.
    expect(lockIdx).toBeLessThan(readIdx)
    expect(calls[lockIdx]).toMatch(/FOR UPDATE/i)
    expect(calls[readIdx]).toMatch(/FOR UPDATE/i)
  })

  it("serialisasi: kunci baris quotation yang SAMA dipakai jalur material issue", async () => {
    const tx = buildTx({ moves: [salesMovePosted] })
    await expect(
      assertMaterialIssueStockOutOnce(tx, 40, [{ itemId: 7, qty: 3 }]),
    ).rejects.toThrow(/SAL-BR-014/)

    const calls = rawCalls(tx)
    const lockIdx = calls.findIndex((sql) => /FROM\s+quotations/i.test(sql))
    const readIdx = calls.findIndex((sql) => /FROM\s+stock_moves/i.test(sql))
    expect(lockIdx).toBeGreaterThanOrEqual(0)
    expect(lockIdx).toBeLessThan(readIdx)
    expect(calls[lockIdx]).toMatch(/FOR UPDATE/i)
  })

  it("kunci bersama: quotation didedupe + diurutkan naik (urutan kunci deterministik)", async () => {
    const tx = buildTx({ moves: [] })
    const locked = await lockStockOutQuotationsTx(tx, [30, 10, 30, null, 0, -1, 20])
    expect(locked).toEqual([10, 20, 30])
    const calls = rawCalls(tx)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatch(/FROM\s+quotations/i)
    expect(calls[0]).toMatch(/ORDER BY id/i)
    expect(calls[0]).toMatch(/FOR UPDATE/i)
  })

  it("tanpa pohon quotation: tidak ada kunci yang diambil (tanpa lock global)", async () => {
    const tx = buildTx({
      moves: [miMovePosted],
      invoices: [
        { id: 60, quotationId: null, salesOrderId: null, projectId: null, deletedAt: null },
      ],
    })
    await expect(
      assertSalesInvoiceStockOutOnce(tx, 60, [{ itemId: 7, qty: 3 }]),
    ).resolves.toBeUndefined()
    expect(rawCalls(tx)).toEqual([])
  })
})
