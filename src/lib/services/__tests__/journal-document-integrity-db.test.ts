import { afterAll, describe, expect, it } from "vitest"
import { Prisma } from "@prisma/client"

import { prisma } from "@/lib/db/prisma"

/**
 * Integritas referensi jurnal ↔ dokumen + rezim nomor dokumen (putaran 249)
 * — READ-ONLY, gate `RUN_DB_INTEGRATION=1`. Aman terhadap DB dev yang
 * dirawat tangan: hanya SELECT.
 *
 *  1. Setiap jurnal bertipe yang terpeta wajib menunjuk baris yang ADA
 *     (dan hidup bila tabelnya soft-delete). Tipe baru tanpa pemetaan
 *     merah supaya pemetaan ikut berjalan, bukan diam-diam tak diperiksa.
 *  2. Setiap jurnal sumber REVERSED wajib punya lawan pembalik
 *     (`referenceType Journal` yang merujuknya).
 *  3. Pembayaran penjualan berstatus `posted` wajib punya jurnal
 *     SalesPayment (POSTED atau pair REVERSED yang juga merujuknya).
 *  4. Rezim nomor: per tubuh nomor (digit kosong di-skeleton), prefix digit
 *     wajib menaik mengikuti id. Baris hidup tanpa nomor pola
 *     `NNN/...`/`PREFIX/NNN/...` hanya boleh dari pengecualian eksplisit.
 */

const SKIP = process.env.RUN_DB_INTEGRATION !== "1"

/**
 * Pemetaan referenceType jurnal -> tabel tujuan, delegasi Prisma, & soft-delete-ness.
 * Mencakup seluruh pembuat jurnal nyata di codebase + fixture E2E `OpeningBalanceE2E`
 * (yang merujuk akun `accounts` dan deskripsi `"Saldo awal E2E Kas Kecil"`).
 * Tipe baru tanpa pemetaan tetap merah supaya pemetaan ikut berjalan.
 */
interface ReferenceMapping {
  table: string
  model: keyof typeof prisma
  softDeleted: boolean
}

const REFERENCE_TABLES: Record<string, ReferenceMapping> = {
  SalesPayment: { table: "sales_payments", model: "salesPayment", softDeleted: false },
  SalesInvoice: { table: "sales_invoices", model: "salesInvoice", softDeleted: true },
  SalesInvoiceCOGS: { table: "sales_invoices", model: "salesInvoice", softDeleted: true },
  SalesInvoiceReversal: { table: "sales_invoices", model: "salesInvoice", softDeleted: true },
  SalesReturn: { table: "sales_returns", model: "salesReturn", softDeleted: false },
  SalesLateFee: { table: "sales_late_fees", model: "salesLateFee", softDeleted: true },
  SalesLateFeePayment: { table: "sales_late_fee_payments", model: "salesLateFeePayment", softDeleted: false },
  PurchaseOrder: { table: "purchase_orders", model: "purchaseOrder", softDeleted: true },
  GoodsReceipt: { table: "goods_receipts", model: "goodsReceipt", softDeleted: false },
  GoodsReceiptService: { table: "goods_receipts", model: "goodsReceipt", softDeleted: false },
  PurchaseReturn: { table: "purchase_returns", model: "purchaseReturn", softDeleted: false },
  PurchaseAdvance: { table: "purchase_advances", model: "purchaseAdvance", softDeleted: true },
  VendorBill: { table: "vendor_bills", model: "vendorBill", softDeleted: true },
  VendorPayment: { table: "vendor_payments", model: "vendorPayment", softDeleted: true },
  StockAdjustment: { table: "stock_adjustments", model: "stockAdjustment", softDeleted: true },
  InventoryTransfer: { table: "inventory_transfers", model: "inventoryTransfer", softDeleted: false },
  MaterialIssue: { table: "material_issues", model: "materialIssue", softDeleted: false },
  ProductionOrder: { table: "production_orders", model: "productionOrder", softDeleted: false },
  ProductionCost: { table: "production_costs", model: "productionCost", softDeleted: false },
  ProductionOrderMaterialIssue: { table: "stock_moves", model: "stockMove", softDeleted: false },
  ProductionOrderAbnormalScrap: { table: "stock_moves", model: "stockMove", softDeleted: false },
  ProductionOrderCostVariance: { table: "production_orders", model: "productionOrder", softDeleted: false },
  Expense: { table: "expenses", model: "expense", softDeleted: false },
  ExpenseReimbursementAccrual: { table: "expenses", model: "expense", softDeleted: false },
  ExpenseReimbursementPayment: { table: "expenses", model: "expense", softDeleted: false },
  PettyCash: { table: "petty_cash", model: "pettyCash", softDeleted: true },
  DownPayment: { table: "down_payments", model: "downPayment", softDeleted: false },
  BANK_TRANSFER: { table: "bank_transfers", model: "bankTransfer", softDeleted: true },
  TaxPayment: { table: "tax_payments", model: "taxPayment", softDeleted: true },
  WithholdingCertificate: { table: "withholding_certificates", model: "withholdingCertificate", softDeleted: false },
  CustomerCreditRefund: { table: "customer_credits", model: "customerCredit", softDeleted: false },
  CommissionPayableAccrual: { table: "sales_invoices", model: "salesInvoice", softDeleted: true },
  CommissionPayableCancellation: { table: "sales_invoices", model: "salesInvoice", softDeleted: true },
  CommissionPayableReversal: { table: "sales_returns", model: "salesReturn", softDeleted: false },
  Payroll: { table: "payrolls", model: "payroll", softDeleted: false },
  EmployeeLoan: { table: "employee_loans", model: "employeeLoan", softDeleted: false },
  EmployeeLoanRepayment: { table: "employee_loan_repayments", model: "employeeLoanRepayment", softDeleted: false },
  EmployeeLoanWriteOff: { table: "employee_loan_write_offs", model: "employeeLoanWriteOff", softDeleted: false },
  DisciplinaryDeduction: { table: "disciplinary_deduction_decisions", model: "disciplinaryDeductionDecision", softDeleted: true },
  ASSET_ACQUISITION: { table: "assets", model: "asset", softDeleted: false },
  ASSET_DISPOSAL: { table: "assets", model: "asset", softDeleted: false },
  ASSET_CHANGE_EVENT: { table: "assets", model: "asset", softDeleted: false },
  WarrantyClaim: { table: "warranty_claims", model: "warrantyClaim", softDeleted: false },
  WarrantyClaimCost: { table: "warranty_claims", model: "warrantyClaim", softDeleted: false },
  WarrantySupplierRecovery: { table: "warranty_claims", model: "warrantyClaim", softDeleted: false },
  Journal: { table: "journals", model: "journal", softDeleted: true },
  OpeningBalanceE2E: { table: "accounts", model: "account", softDeleted: true },
}

function resolveReferenceMapping(type: string): ReferenceMapping | null {
  if (REFERENCE_TABLES[type]) return REFERENCE_TABLES[type]
  if (/^ASSET_DEPRECIATION_\d{6}$/.test(type)) {
    return { table: "assets", model: "asset", softDeleted: false }
  }
  if (/^RecurringTransaction_\d{8}$/.test(type)) {
    return { table: "recurring_transactions", model: "recurringTransaction", softDeleted: true }
  }
  if (/^ProductionOrder_\d+$/.test(type) || /^ProductionOrderCostVariance_\d+$/.test(type)) {
    return { table: "production_orders", model: "productionOrder", softDeleted: false }
  }
  return null
}

function isPeriodReferenceType(type: string): boolean {
  return type === "YearEndClosing" || type === "PkwtCompensationAccrual"
}

function isValidPeriodReferenceId(type: string, referenceId: number): boolean {
  if (type === "YearEndClosing") return Number.isInteger(referenceId) && referenceId >= 1900 && referenceId <= 2200
  if (type === "PkwtCompensationAccrual") {
    const year = Math.floor(referenceId / 100)
    const month = referenceId % 100
    return Number.isInteger(referenceId) && year >= 1900 && year <= 2200 && month >= 1 && month <= 12
  }
  return false
}

/** Tabel dokumen ber-kolom nomor + apakah tabelnya soft-delete. */
interface NumberedSpec {
  table: string
  column: string
  softDeleted: boolean
}

const NUMBERED_TABLES: NumberedSpec[] = [
  { table: "sales_invoices", column: "document_no", softDeleted: true },
  { table: "sales_orders", column: "document_no", softDeleted: true },
  { table: "quotations", column: "document_no", softDeleted: true },
  { table: "sales_payments", column: "document_no", softDeleted: false },
  { table: "sales_returns", column: "document_no", softDeleted: false },
  { table: "purchase_orders", column: "document_no", softDeleted: true },
  { table: "purchase_requests", column: "document_no", softDeleted: false },
  { table: "purchase_returns", column: "document_no", softDeleted: false },
  { table: "goods_receipts", column: "document_no", softDeleted: false },
  { table: "vendor_bills", column: "document_no", softDeleted: true },
  { table: "vendor_payments", column: "document_no", softDeleted: true },
  { table: "delivery_orders", column: "document_no", softDeleted: false },
  { table: "down_payments", column: "document_no", softDeleted: false },
  { table: "stock_adjustments", column: "document_no", softDeleted: true },
  { table: "material_issues", column: "document_no", softDeleted: false },
  { table: "journals", column: "journal_number", softDeleted: false },
]

/**
 * Nomor fixture seed E2E yang sengaja memakai nomor khusus untuk
 * keandalan E2E (spec mencari teksnya). Dihitung dua arah: bila
 * perbaikan membuat nomor itu balik ke rezim kanonis, entri ini wajib
 * dipangkas — persis konvensi penjaga repo.
 */
const NUMBERING_EXCEPTIONS = new Set(["purchase_orders/E2E-PO-CHAIN"])

/**
 * Parser nomor kanonis, dua rezim:
 *   digit-awal :   `010/SO/IRO/10/2026` → seq 10, keluarga `/SO/IRO/10/2026`
 *                  (tail bulan/tahun ikut keluarga supaya reset bulanan sah)
 *   huruf-awal :   `JRN-RV/70/[stamp]`  → seq 70, keluarga `JRN-RV/[stamp]`
 *   `EXP/7/[stamp]-0007` → seq 7, keluarga `EXP/[stamp]-0007`
 * Selain itu di luar rezim (seq null) — baris hidup seperti ini hanya
 * boleh berasal dari NUMBERING_EXCEPTIONS.
 */
function parseNumber(value: string | null): { seq: number | null; family: string } {
  if (!value) return { seq: null, family: "" }
  const digitFirst = /^(\d+)\/(.+)$/.exec(value)
  if (digitFirst) {
    return { seq: Number(digitFirst[1]), family: `/${digitFirst[2]}` }
  }
  const wordFirst = /^([A-Za-z][A-Za-z-]*)\/(\d+)\/(.+)$/.exec(value)
  if (wordFirst) {
    return { seq: Number(wordFirst[2]), family: `${wordFirst[1]}/${wordFirst[3]}` }
  }
  // Rezim tanpa slash: `JRN-202610-00006` → seq 6, keluarga `JRN-202610`
  // (tubuh periode ikut keluarga supaya reset bulanan tetap sah).
  const stampFirst = /^([A-Za-z][A-Za-z-]*)-([0-9]+)-(\d+)$/.exec(value)
  if (stampFirst) {
    return { seq: Number(stampFirst[3]), family: `${stampFirst[1]}-${stampFirst[2]}` }
  }
  return { seq: null, family: value }
}

const exceptionKey = (table: string, documentNo: string | null): string =>
  `${table}/${(documentNo ?? "").trim()}`

describe.skipIf(SKIP)("integritas referensi jurnal + rezim nomor dokumen (DB, read-only)", () => {
  afterAll(async () => {
    await prisma.$disconnect()
  })

  it("setiap jurnal bertipe terpeta merujuk baris yang ada; REVERSED saja yang boleh ke baris void", async () => {
    const journalsWithRefs = await prisma.journal.findMany({
      where: { referenceType: { not: null }, referenceId: { not: null } },
      select: { id: true, status: true, referenceType: true, referenceId: true, description: true },
    })

    const presentTypes = [...new Set(journalsWithRefs.map((j) => j.referenceType as string))]
    const mappingByType = new Map<string, ReferenceMapping>()
    const unknownTypes: string[] = []
    for (const type of presentTypes) {
      if (isPeriodReferenceType(type)) continue
      const mapping = resolveReferenceMapping(type)
      if (!mapping) unknownTypes.push(type)
      else mappingByType.set(type, mapping)
    }
    // Tipe baru di DB tanpa pemetaan merah supaya pemetaan ikut berjalan.
    expect(unknownTypes).toEqual([])

    // Baris hidup di `findMany` sudah disaring plugin soft-delete;
    // baris BARU-penuh diambil lewat $queryRaw supaya baris void (deletedAt
    // terisi) ikut terlihat: jurnal REVERSED yang merujuk baris void adalah
    // alur penghapusan yang sah (mis. deleteBankTransfer), barunya yang
    // tidak punya baris sama sekali adalah tautan putus.
    const livingByTable = new Map<string, Set<number>>()
    const rawByTable = new Map<string, Set<number>>()
    for (const mapping of mappingByType.values()) {
      if (livingByTable.has(mapping.table)) continue
      const delegate = prisma[mapping.model] as unknown as {
        findMany: (args: { select: { id: true } }) => Promise<Array<{ id: number }>>
      }
      const livingRows = await delegate.findMany({ select: { id: true } })
      livingByTable.set(mapping.table, new Set(livingRows.map((row) => row.id)))
      if (mapping.softDeleted) {
        const rawRows = await prisma.$queryRaw<Array<{ id: number }>>(
          Prisma.sql`SELECT id FROM ${Prisma.raw(`\`${mapping.table}\``)}`,
        )
        rawByTable.set(mapping.table, new Set(rawRows.map((row) => row.id)))
      }
    }

    const dangling: string[] = []
    for (const journal of journalsWithRefs) {
      const type = journal.referenceType as string
      const referenceId = journal.referenceId as number
      if (isPeriodReferenceType(type)) {
        if (!isValidPeriodReferenceId(type, referenceId)) {
          dangling.push(`${type}:${referenceId} (jurnal ${journal.id} ${journal.status})`)
        }
        continue
      }
      if (type === "OpeningBalanceE2E" && journal.description !== "Saldo awal E2E Kas Kecil") {
        dangling.push(`${type}:${referenceId} (jurnal ${journal.id} bukan fixture E2E resmi)`)
        continue
      }
      const mapping = mappingByType.get(type)!
      const living = livingByTable.get(mapping.table)
      if (!living?.has(referenceId)) {
        const raw = rawByTable.get(mapping.table)
        const voidedRowPresent = mapping.softDeleted && raw?.has(referenceId)
        if (voidedRowPresent && journal.status === "REVERSED") continue
        dangling.push(`${type}:${referenceId} (jurnal ${journal.id} ${journal.status})`)
      }
    }
    expect(dangling).toEqual([])
  })

  it("jurnal REVERSED rujukan Journal wajib punya lawan pembalik yang membaliknya", async () => {
    const pairs = await prisma.$queryRaw<Array<{ source: number; reversal: number }>>`
      SELECT source_journal.id AS source, reversal_journal.id AS reversal
      FROM journals source_journal
      JOIN journals reversal_journal
        ON reversal_journal.reference_type = 'Journal'
       AND reversal_journal.reference_id = source_journal.id
      WHERE source_journal.status = 'REVERSED' AND source_journal.deleted_at IS NULL
      GROUP BY source_journal.id, reversal_journal.id
    `
    // Jurnal yang REVERSED tanpa pembalik yang masih ada = pembalikan yang
    // pernah terputus di tengah jalan (crash di antara dua create).
    const reversedSources = new Set(pairs.map((pair) => pair.source))
    const reversedAll = await prisma.journal.findMany({
      where: { status: "REVERSED", deletedAt: null },
      select: { id: true },
    })
    const unbalanced = reversedAll
      .filter((journal) => !reversedSources.has(journal.id))
      .map((journal) => journal.id)
    expect(unbalanced).toEqual([])
  })

  it("pembayaran penjualan posted wajib punya jurnal SalesPayment yang merujuknya", async () => {
    const [payments, journalRefs] = await Promise.all([
      prisma.salesPayment.findMany({
        where: { status: "posted" },
        select: { id: true, documentNo: true },
      }),
      prisma.journal.findMany({
        where: { referenceType: "SalesPayment", deletedAt: null },
        select: { referenceId: true },
      }),
    ])
    const covered = new Set(journalRefs.map((j) => j.referenceId))
    const uncovered = payments
      .filter((payment) => !covered.has(payment.id))
      .map((payment) => payment.documentNo)
    expect(uncovered).toEqual([])
  })

  it("nomor dokumen: per keluarga wajib menaik mengikuti id; baris hidup tanpa nomor pola hanya dari pengecualian", async () => {
    for (const spec of NUMBERED_TABLES) {
      const filter = spec.softDeleted ? Prisma.sql`WHERE deleted_at IS NULL` : Prisma.empty
      const rows = await prisma.$queryRaw<Array<{ id: number; numberValue: string | null }>>(
        Prisma.sql`SELECT id, ${Prisma.raw(`\`${spec.column}\``)} AS numberValue
                   FROM ${Prisma.raw(`\`${spec.table}\``)} ${filter}
                   ORDER BY id ASC`,
      )
      if (rows.length === 0) continue

      const outOfRegime = rows.filter((row) => parseNumber(row.numberValue).seq === null)
      const unexpected = outOfRegime
        .map((row) => exceptionKey(spec.table, row.numberValue))
        .filter((key) => !NUMBERING_EXCEPTIONS.has(key))
        .map((key) => `${spec.table} → ${key}`)

      // (a) Baris hidup dengan nomor di luar rezim (mis. fixture sisa E2E
      //     yang lupa dibersihkan) merah di sini, di-hijaukan hanya dengan
      //     entri eksplisit di NUMBERING_EXCEPTIONS.
      expect(unexpected).toEqual([])

      // (b) Monotonisitas: dalam satu keluarga (skeleton nomor), prefix
      //     digit tidak boleh menurun mengikuti id — layanan penomoran
      //     maju satu arah.
      const byFamily = new Map<string, number>()
      for (const row of rows) {
        const parsed = parseNumber(row.numberValue)
        if (parsed.seq === null) continue
        const previous = byFamily.get(parsed.family)
        if (previous !== undefined) {
          expect(
            parsed.seq,
            `${spec.table} • ${parsed.family} • id ${row.id} nomor menurun`,
          ).toBeGreaterThan(previous)
        }
        byFamily.set(parsed.family, parsed.seq)
      }
    }
  })
})
