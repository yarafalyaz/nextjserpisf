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
 * Pemetaan referenceType jurnal -> tabel tujuan + soft-delete-ness.
 * Tipe yang muncul di DB dev & seed:
 *   SalesPayment(sales_payments), SalesInvoice, SalesReturn(sales_returns),
 *   VendorBill, VendorPayment, Expense(expenses), BANK_TRANSFER,
 *   Journal(journals — lawan reversal).
 * Point lah tabel Articles; sales_returns/purchase_returns/delivery_orders
 * dll. TANPA deleted_at jadi dianggap hard-delete.
 */
const REFERENCE_TABLES: Record<
  string,
  { table: "sales_payments" | "sales_invoices" | "sales_returns" | "vendor_bills" | "vendor_payments" | "expenses" | "bank_transfers" | "journals"; softDeleted: boolean }
> = {
  SalesPayment: { table: "sales_payments", softDeleted: false },
  SalesInvoice: { table: "sales_invoices", softDeleted: true },
  SalesReturn: { table: "sales_returns", softDeleted: false },
  VendorBill: { table: "vendor_bills", softDeleted: true },
  VendorPayment: { table: "vendor_payments", softDeleted: true },
  Expense: { table: "expenses", softDeleted: false },
  BANK_TRANSFER: { table: "bank_transfers", softDeleted: true },
  Journal: { table: "journals", softDeleted: false },
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
      select: { id: true, status: true, referenceType: true, referenceId: true },
    })

    const presentTypes = [...new Set(journalsWithRefs.map((j) => j.referenceType as string))]
    const unknownTypes = presentTypes.filter((type) => !REFERENCE_TABLES[type])
    // Tipe baru di DB tanpa pemetaan merah supaya pemetaan ikut berjalan.
    expect(unknownTypes).toEqual([])

    // Baris hidup di `findMany` sudah disaring plugin soft-delete;
    // baris BARU-penuh diambil lewat $queryRaw supaya baris void (deletedAt
    // terisi) ikut terlihat: jurnal REVERSED yang merujuk baris void adalah
    // alur penghapusan yang sah (mis. deleteBankTransfer), barunya yang
    // tidak punya baris sama sekali adalah tautan putus.
    const livingByType = new Map<string, Set<number>>()
    const rawByType = new Map<string, Set<number>>()
    const modelFor: Record<string, () => Promise<Array<{ id: number }>>> = {
      SalesPayment: () => prisma.salesPayment.findMany({ select: { id: true } }),
      SalesInvoice: () => prisma.salesInvoice.findMany({ select: { id: true } }),
      SalesReturn: () => prisma.salesReturn.findMany({ select: { id: true } }),
      VendorBill: () => prisma.vendorBill.findMany({ select: { id: true } }),
      VendorPayment: () => prisma.vendorPayment.findMany({ select: { id: true } }),
      Expense: () => prisma.expense.findMany({ select: { id: true } }),
      BANK_TRANSFER: () => prisma.bankTransfer.findMany({ select: { id: true } }),
      Journal: () => prisma.journal.findMany({ select: { id: true } }),
    }
    for (const [type, mapping] of Object.entries(REFERENCE_TABLES)) {
      const livingRows = await modelFor[type]()
      livingByType.set(type, new Set(livingRows.map((row) => row.id)))
      if (mapping.softDeleted) {
        const rawRows = await prisma.$queryRaw<Array<{ id: number }>>(
          Prisma.sql`SELECT id FROM ${Prisma.raw(`\`${mapping.table}\``)}`,
        )
        rawByType.set(type, new Set(rawRows.map((row) => row.id)))
      }
    }

    const dangling: string[] = []
    for (const journal of journalsWithRefs) {
      const type = journal.referenceType as string
      const referenceId = journal.referenceId as number
      const living = livingByType.get(type)
      if (!living?.has(referenceId)) {
        const raw = rawByType.get(type)
        const voidedRowPresent = REFERENCE_TABLES[type].softDeleted && raw?.has(referenceId)
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
