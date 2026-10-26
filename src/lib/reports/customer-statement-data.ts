/**
 * F-2026-10-21-032: loader customer statement (mutasi piutang per pelanggan).
 *
 * Read-model murni: tanpa migrasi, tanpa jurnal, tanpa mutasi. Sumber
 * kebenaran piutang sama dengan laporan piutang existing — faktur
 * berstatus recognised (`RECOGNISED_AR_STATUSES`: posted/partial/paid,
 * bukan draft/sent/approved/cancelled) dan `deletedAt: null`.
 *
 * Alokasi CustomerCredit tidak punya tabel alokasi sendiri: ia hidup
 * sebagai SalesPayment `paymentMethod === "customer_credit"` (lihat
 * `customer-credit.service.ts`), jadi loader mengklasifikasikannya dari
 * paymentMethod — TIDAK membaca `CustomerCredit.allocatedAmount` sebagai
 * baris terpisah, karena itu akan menggandakan Cr yang sama. Nomor
 * dokumen kredit dipulihkan dari notes payment
 * ("Alokasi kredit pelanggan <docNo> [idem:…]") bila terbaca.
 *
 * Semua faktur+payment pelanggan dibaca sekali (tanpa batas periode di
 * query): builder membelah saldo awal vs baris periode dari himpunan yang
 * sama, jadi saldo akhir tidak bisa selisih dari agregasi piutang.
 *
 * F-2026-10-23-104-V Putusan 2: retur `completed` pelanggan ber-faktur asal
 * dibaca terpisah; `returnCredit` = Σ kaki Cr akun Piutang
 * (`salesReceivableAccountId`) jurnal SalesReturn POSTED bukan REVERSED
 * atas retur itu. Akun belum terkonfigurasi / settings gagal → returnCredit
 * 0 (pola sales-target-achievement-data), statement tetap jalan. Jurnal
 * REVERSED tidak dihitung; retur tanpa faktur asal tak pernah diteruskan.
 *
 * F-2026-10-25-038-B1 (Q-SW-2): loader juga memuat phone pelanggan terpilih
 * + riwayat jejak WA statement untuk permukaan halaman statement. Kedua
 * bukan bagian payload builder statement (BR-ST-06 beku): `phone` terpisah
 * dari `customer` existing, jejak adalah baris ActivityLog
 * `whatsapp_link_opened` jenis `CustomerStatement` berjangkar pelanggan,
 * terbaru-dulu, dibaca apa adanya (label jujur "Tautan WhatsApp dibuka"
 * milik UI; loader tidak mengarang status terkirim/dibaca, BR-SW-01).
 *
 * F-2026-10-25-025-S (Q-ST-1=(a) Lead, BR-ST-01..08): loader memuat
 * `dueDate` faktur + item tukar faktur AKTIF terakhir per faktur
 * (deletedAt null; tanggal terbesar, seri id terbesar — BR-COL-04) dalam
 * SATU query massal atas seluruh faktur statement (query exchangeItem
 * `salesInvoiceId in (...)` pola collection-queue-data.ts, tanpa N+1).
 * Due acuan per faktur (exchange ?? invoice) diturunkan builder murni
 * lewat field input opsional — loader hanya meneruskan dua tanggal.
 * Kolom Jatuh Tempo + penanda ikut tabel PDF registry (BR-ST-08);
 * Export PDF mempunyai tabel sendiri di registry — bukan dari loader ini.
 *
 * F-2026-10-25-043-B1 (Q-SE-3): loader juga memuat email pelanggan terpilih
 * (select perluasan `email`, tanpa PII masuk log — alamat hanya bepergian
 * di payload halaman bergerbang `view_reports`) + riwayat jejak EMAIL
 * statement TERPISAH dari WA: baris `email_link_opened` berjangkar
 * pelanggan, terbaru-dulu, dibaca apa adanya (label jujur "Tautan Email
 * dibuka" milik UI; loader tidak mengarang status terkirim/dibaca,
 * BR-SE-01/BR-SE-10). Payload builder statement tetap beku (BR-ST-06).
 */

import { prisma } from "@/lib/db/prisma"
import { rangePeriodLabels } from "@/lib/reports/period-label"
import { RECOGNISED_AR_STATUSES } from "@/lib/reports/document-status"
import {
  buildCustomerStatement,
  CUSTOMER_STATEMENT_DUE_COLUMN,
  CUSTOMER_STATEMENT_OVERDUE_LABEL,
  type CustomerStatement,
  type CustomerStatementInvoiceInput,
  type CustomerStatementPaymentInput,
  type CustomerStatementReturnInput,
} from "@/lib/reports/customer-statement"
import { loadReturnCreditByReturnId } from "@/lib/reports/return-credit"
import { salesInvoiceLabel } from "@/lib/utils/invoice-label"
import { formatAccounting } from "@/lib/utils/format"
import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"

export interface CustomerStatementWhatsappTrailEntry {
  /** Nama staf yang membuka tautan; null bila baris tak ber-user. */
  userName: string | null
  createdAt: Date
}

/**
 * Entri jejak tautan email statement (043-B1) — TERPISAH dari jejak WA
 * (BR-SE-10: kanal tidak digabung jadi satu klaim hubungi). Bentuk sama
 * dengan entri WA supaya UI bisa me-render pola riwayat yang sama.
 */
export type CustomerStatementEmailTrailEntry = CustomerStatementWhatsappTrailEntry

export interface CustomerStatementReport {
  statement: CustomerStatement
  /** Bentuk existing beku (BR-ST-06): id+nama saja; phone ada di field terpisah. */
  customer: { id: number; name: string } | null
  /** Nomor pelanggan terpilih untuk jalur WA (Customer.phone); null bila kosong. */
  customerPhone: string | null
  /** Alamat email pelanggan terpilih untuk jalur mailto (Customer.email); null bila kosong. */
  customerEmail: string | null
    /** Jejak klik WA statement pelanggan ini, terbaru-dulu (baca-saja). */
  whatsappTrail: CustomerStatementWhatsappTrailEntry[]
  /** Jejak klik email statement pelanggan ini, terbaru-dulu (baca-saja, terpisah WA). */
  emailTrail: CustomerStatementEmailTrailEntry[]
  table: { columns: TableColumn[]; rows: TableRow[] }
  periodLabel: string
  periodCaption: string
}

const COLUMNS: TableColumn[] = [
  { header: "Tanggal", align: "left", width: 30 },
  { header: "Dokumen", align: "left", width: 38 },
  { header: CUSTOMER_STATEMENT_DUE_COLUMN, align: "left", width: 30 },
  { header: "Keterangan", align: "left", width: 62 },
  { header: "Debit", align: "right", width: 32 },
  { header: "Kredit", align: "right", width: 32 },
  { header: "Saldo", align: "right", width: 32 },
]

const money = (value: number) => formatAccounting(value, { zeroDash: false })
const shortDate = (date: Date) =>
  date.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })

/** Nomor dokumen CustomerCredit dari notes payment alokasi; null bila tak terbaca. */
export function creditDocumentNoFromNotes(notes: string | null | undefined): string | null {
  if (!notes) return null
  const match = notes.match(/Alokasi kredit pelanggan\s+(\S+)/)
  return match ? match[1] : null
}

/**
 * Jejak klik tautan statement pelanggan per kanal (apa adanya,
 * terbaru-dulu) — ActivityLog action kanal (`whatsapp_link_opened` /
 * `email_link_opened`) jenis `CustomerStatement`, modelId = ID pelanggan.
 * Baris hanya membuktikan tautan dibuka; fungsi ini tidak menghitung
 * status terkirim/dibaca apa pun (BR-SW-01/BR-SE-01). Kanal tetap TERPISAH
 * sebagai field hasil berbeda (BR-SE-10) — hanya mekanik query yang sama.
 */
async function loadStatementLinkTrail(
  customerId: number,
  action: "whatsapp_link_opened" | "email_link_opened",
): Promise<CustomerStatementWhatsappTrailEntry[]> {
  const rows = await prisma.activityLog.findMany({
    where: { modelType: "CustomerStatement", modelId: customerId, action },
    orderBy: { createdAt: "desc" },
    take: 25,
    select: { userId: true, createdAt: true },
  })

  const userIds = Array.from(new Set(rows.map((r) => r.userId).filter((id) => id != null)))
  const users =
    userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true },
        })
      : []
  const nameById = new Map(users.map((u) => [u.id, u.name]))

  return rows.map((r) => ({
    userName: r.userId ? (nameById.get(r.userId) ?? null) : null,
    createdAt: r.createdAt,
  }))
}

export async function loadCustomerStatement(
  customerId: number,
  period: { start: Date; end: Date },
): Promise<CustomerStatementReport> {
  const [customer, customerContact, whatsappTrail, emailTrail, invoices, exchangeItems, payments, salesReturns] = await Promise.all([
    prisma.customer.findFirst({
      where: { id: customerId, deletedAt: null },
      select: { id: true, name: true },
    }),
    // Kontak menyatakan PELANGGAN TERPILIH, bukan keberadaan statement:
    // dibaca tanpa filter deleted supaya grup jejak tetap memuat kontak
    // pelanggan yang sempat tampil (BR-SW-03/BR-SW-09 mengikuti pilihan
    // halaman existing lewat keberadaan pelanggan di jalur ini). Email
    // ikut satu query yang sama (043-B1) — bukan query tambahan.
    prisma.customer.findFirst({
      where: { id: customerId },
      select: { phone: true, email: true },
    }),
    loadStatementLinkTrail(customerId, "whatsapp_link_opened"),
    loadStatementLinkTrail(customerId, "email_link_opened"),
    prisma.salesInvoice.findMany({
      where: {
        customerId,
        status: { in: [...RECOGNISED_AR_STATUSES] },
        deletedAt: null,
      },
      select: { id: true, documentNo: true, date: true, grandTotal: true, dueDate: true },
      orderBy: [{ date: "asc" }, { id: "asc" }],
    }),
    prisma.invoiceExchangeItem.findMany({
      where: {
        salesInvoice: {
          customerId,
          status: { in: [...RECOGNISED_AR_STATUSES] },
          deletedAt: null,
        },
        exchange: { deletedAt: null },
      },
      select: {
        salesInvoiceId: true,
        exchange: {
          select: { id: true, date: true, dueDate: true, deletedAt: true },
        },
      },
    }),
    prisma.salesPayment.findMany({
      where: { salesInvoice: { customerId, deletedAt: null } },
      select: {
        id: true,
        documentNo: true,
        salesInvoiceId: true,
        paymentDate: true,
        amount: true,
        withholdingAmount: true,
        paymentMethod: true,
        notes: true,
        salesInvoice: { select: { id: true, documentNo: true } },
      },
      orderBy: [{ paymentDate: "asc" }, { id: "asc" }],
    }),
    prisma.salesReturn.findMany({
      where: { customerId, status: "completed", salesInvoiceId: { not: null } },
      select: {
        id: true,
        documentNo: true,
        salesInvoiceId: true,
        date: true,
        salesInvoice: { select: { id: true, documentNo: true } },
      },
      orderBy: [{ date: "asc" }, { id: "asc" }],
    }),
  ])

  // returnCredit per retur dari kaki Cr Piutang jurnal POSTED (F-104-V),
  // lewat helper bersama return-credit.ts.
  const returnCreditByReturnId = await loadReturnCreditByReturnId(
    salesReturns.map((r) => r.id),
  )
  const returnInvoiceIds = new Set(invoices.map((inv) => inv.id))

  // Tukar faktur aktif terakhir per faktur (BR-COL-04): tanggal terbesar,
  // seri id exchange terbesar; exchange terhapus diabaikan. Satu peta dari
  // query massal di atas — tanpa query per faktur.
  const latestExchangeDueByInvoice = new Map<number, Date | null>()
  const latestExchangeKeyByInvoice = new Map<number, string>()
  for (const item of exchangeItems) {
    const exchange = item.exchange
    if (!exchange || exchange.deletedAt != null) continue
    const key = `${new Date(exchange.date).getTime()}:${exchange.id}`
    if (key > (latestExchangeKeyByInvoice.get(item.salesInvoiceId) ?? "")) {
      latestExchangeKeyByInvoice.set(item.salesInvoiceId, key)
      latestExchangeDueByInvoice.set(
        item.salesInvoiceId,
        exchange.dueDate ? new Date(exchange.dueDate) : null,
      )
    }
  }

  const invoiceInputs: CustomerStatementInvoiceInput[] = invoices.map((inv) => ({
    id: inv.id,
    documentNo: salesInvoiceLabel(inv),
    date: new Date(inv.date),
    grandTotal: Number(inv.grandTotal),
    dueDate: inv.dueDate ? new Date(inv.dueDate) : null,
    exchangeDueDate: latestExchangeDueByInvoice.get(inv.id) ?? null,
  }))
  const paymentInputs: CustomerStatementPaymentInput[] = payments.map((pay) => ({
    id: pay.id,
    documentNo: pay.documentNo,
    salesInvoiceId: pay.salesInvoiceId,
    salesInvoiceDocumentNo: salesInvoiceLabel(pay.salesInvoice),
    paymentDate: new Date(pay.paymentDate),
    amount: Number(pay.amount),
    withholdingAmount: Number(pay.withholdingAmount ?? 0),
    paymentMethod: pay.paymentMethod,
    creditDocumentNo: creditDocumentNoFromNotes(pay.notes),
  }))

  const returnInputs: CustomerStatementReturnInput[] = salesReturns
    .filter((ret) => ret.salesInvoiceId !== null && returnInvoiceIds.has(ret.salesInvoiceId as number))
    .map((ret) => ({
      id: ret.id,
      documentNo: ret.documentNo,
      salesInvoiceId: ret.salesInvoiceId as number,
      salesInvoiceDocumentNo: ret.salesInvoice ? salesInvoiceLabel(ret.salesInvoice) : "",
      date: new Date(ret.date),
      returnCredit: returnCreditByReturnId.get(ret.id) ?? 0,
    }))

  const statement = buildCustomerStatement({
    customerId,
    periodStart: period.start,
    periodEnd: period.end,
    invoices: invoiceInputs,
    payments: paymentInputs,
    returns: returnInputs,
  })

  const rows: TableRow[] = [
    {
      kind: "data",
      cells: ["", "", "", "Saldo awal", "", "", money(statement.openingBalance)],
    },
  ]
  if (statement.entries.length === 0) {
    rows.push({ kind: "notice", text: "Tidak ada mutasi piutang pada periode ini." })
  }
  for (const entry of statement.entries) {
    rows.push({
      kind: "data",
      cells: [
        shortDate(entry.date),
        entry.documentNo,
        entry.dueDate ? shortDate(entry.dueDate) : "—",
        entry.isOverdue
          ? `${entry.description} (${CUSTOMER_STATEMENT_OVERDUE_LABEL})`
          : entry.description,
        entry.debit > 0 ? money(entry.debit) : "",
        entry.credit > 0 ? money(entry.credit) : "",
        money(entry.balance),
      ],
    })
  }
  rows.push({
    kind: "total",
    grand: true,
    label: "Saldo akhir",
    cells: ["", "", "", "", money(statement.totalDebit), money(statement.totalCredit), money(statement.closingBalance)],
  })

  return {
    statement,
    customer,
    customerPhone: customerContact?.phone ?? null,
    customerEmail: customerContact?.email ?? null,
    whatsappTrail,
    emailTrail,
    table: { columns: COLUMNS, rows },
    ...rangePeriodLabels(period),
  }
}
