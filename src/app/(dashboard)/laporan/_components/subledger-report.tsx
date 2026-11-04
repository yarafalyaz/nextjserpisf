import Link from "next/link"
import { prisma } from "@/lib/db/prisma"
import { formatAccountingExact, formatDate } from "@/lib/utils/format"
import { entityHref } from "@/lib/utils/entity-url"
import { safeAdd, safeMultiply, safeSubtract } from "@/lib/utils/math"
import { agingBucket, daysOverdue } from "@/lib/reports/aging"
import { payableOutstanding } from "@/lib/reports/aging-amounts"
import { activeSalesPaymentWhere } from "@/lib/finance/payment-status"
import { loadReturnCreditByInvoiceId, loadReturnCreditByReturnId } from "@/lib/reports/return-credit"
import { RECOGNISED_AP_STATUSES, RECOGNISED_AR_STATUSES } from "@/lib/reports/document-status"
import {
  buildSubledger,
  openingFromEntries,
  periodEntries,
  type SubledgerEntry,
} from "@/lib/reports/subledger"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { EmptyState } from "@/components/ui/empty-state"
import { ExportButtons } from "@/components/reports/export-buttons"
import { buildReportPdfHref } from "@/lib/reports/report-export"
import { buildReportPeriodSlug } from "@/lib/reports/report-period"
import { ReportLetterhead } from "@/components/reports/report-letterhead"
import { ReportSection, ReportKpiCard } from "@/components/reports/report-section"
import { ReportNarration } from "@/components/reports/report-narration"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { salesInvoiceLabel } from "@/lib/utils/invoice-label"

export type SubledgerSide = "AR" | "AP"

interface SubledgerReportProps {
  side: SubledgerSide
  /** Basis rute laporan, mis. "/laporan/buku-pembantu-piutang". */
  basePath: string
  /** Kunci pihak dari path: slug pelanggan/pemasok, atau id sebagai cadangan. */
  partyKey: string | null
  /** Periode sudah diresolusi halaman dari slug path. */
  startDate: Date
  endDate: Date
}

/**
 * Buku Besar Pembantu + Pernyataan (piutang/utang) for one customer/vendor.
 *
 * One component drives both sides so the running-balance logic, layout and
 * export stay identical; only the parties, documents and labels differ.
 */
export async function SubledgerReport({ side, basePath, partyKey, startDate, endDate }: SubledgerReportProps) {
  const isAr = side === "AR"
  const now = new Date()

  const parties = isAr
    ? await prisma.customer.findMany({
        where: { isActive: true, deletedAt: null },
        orderBy: { name: "asc" },
        select: { id: true, code: true, name: true, slug: true },
      })
    : await prisma.vendor.findMany({
        where: { isActive: true, deletedAt: null },
        orderBy: { name: "asc" },
        select: { id: true, code: true, name: true, slug: true },
      })

  // Slug lebih dulu supaya URL-nya terbaca; id numerik tetap diterima agar
  // tautan lama dan baris yang belum punya slug tidak jadi tautan mati.
  const selected = partyKey
    ? parties.find((p) => p.slug === partyKey) ?? parties.find((p) => String(p.id) === partyKey) ?? null
    : null
  const partyId = selected?.id ?? null

  let entries: SubledgerEntry[] = []
  let outstanding: {
    key: string
    documentNo: string
    href: string | null
    date: Date
    dueDate: Date | null
    total: number
    paid: number
    remaining: number
  }[] = []

  if (partyId && selected) {
    if (isAr) {
      const [invoices, payments, returns] = await Promise.all([
        prisma.salesInvoice.findMany({
          where: { customerId: partyId, status: { in: [...RECOGNISED_AR_STATUSES] }, deletedAt: null },
          select: { id: true, slug: true, documentNo: true, date: true, dueDate: true, grandTotal: true, paidAmount: true },
        }),
        prisma.salesPayment.findMany({
          where: activeSalesPaymentWhere({ salesInvoice: { customerId: partyId } }),
          select: { id: true, slug: true, documentNo: true, paymentDate: true, amount: true, withholdingAmount: true, salesInvoice: { select: { id: true, documentNo: true } } },
        }),
        prisma.salesReturn.findMany({
          where: { customerId: partyId, status: "completed" },
          select: { id: true, slug: true, documentNo: true, date: true, salesInvoiceId: true },
        }),
      ])
      const returnCreditByReturnId = await loadReturnCreditByReturnId(returns.map((ret) => ret.id))
      const returnCreditByInvoiceId = await loadReturnCreditByInvoiceId(invoices.map((inv) => inv.id))

      entries = [
        ...invoices.map((inv) => ({
          key: `SalesInvoice:${inv.id}`,
          date: inv.date,
          documentNo: salesInvoiceLabel(inv),
          href: entityHref("/penjualan/faktur", inv),
          description: "Faktur Penjualan",
          debit: Number(inv.grandTotal),
          credit: 0,
        })),
        ...payments.map((pay) => ({
          key: `SalesPayment:${pay.id}`,
          date: pay.paymentDate,
          documentNo: pay.documentNo,
          href: entityHref("/penjualan/pembayaran", pay),
          description: pay.salesInvoice ? `Pembayaran ${salesInvoiceLabel(pay.salesInvoice)}` : "Pembayaran",
          debit: 0,
          // Pelunasan piutang = kas + PPh dipotong pelanggan; basis sama
          // dengan paidAmount, aging, dan PDF buku pembantu.
          credit: safeAdd(pay.amount as never, pay.withholdingAmount as never, 2),
        })),
        ...returns.map((ret) => ({
          key: `SalesReturn:${ret.id}`,
          date: ret.date,
          documentNo: ret.documentNo,
          href: entityHref("/penjualan/retur", ret),
          description: "Retur Penjualan",
          debit: 0,
          // Kredit kanonis = kaki Cr Piutang jurnal SalesReturn POSTED.
          // qty×price mengabaikan PPN dan retur tanpa jurnal.
          credit: returnCreditByReturnId.get(ret.id) ?? 0,
        })),
      ]

      outstanding = invoices
        .map((inv) => ({
          key: `SalesInvoice:${inv.id}`,
          documentNo: salesInvoiceLabel(inv),
          href: entityHref("/penjualan/faktur", inv),
          date: inv.date,
          dueDate: inv.dueDate,
          total: Number(inv.grandTotal),
          paid: Number(inv.paidAmount),
          // Sisa kanonis: grandTotal − pembayaran − kredit retur jurnal.
          remaining: safeSubtract(
            safeSubtract(inv.grandTotal, inv.paidAmount, 2),
            returnCreditByInvoiceId.get(inv.id) ?? 0,
            2,
          ),
        }))
        .filter((row) => row.remaining > 0)
    } else {
      const [bills, payments, returns] = await Promise.all([
        prisma.vendorBill.findMany({
          where: { vendorId: partyId, status: { in: [...RECOGNISED_AP_STATUSES] }, deletedAt: null },
          select: { id: true, slug: true, documentNo: true, date: true, dueDate: true, grandTotal: true, paidAmount: true, balanceDue: true, withholdingAmount: true },
        }),
        prisma.vendorPayment.findMany({
          // Hanya completed: draft belum mengalokasi/memposting, reversed
          // sudah dilawan jurnalnya — keduanya tak boleh mengurangi utang.
          where: { vendorId: partyId, status: "completed", deletedAt: null },
          select: { id: true, slug: true, documentNo: true, paymentDate: true, amount: true },
        }),
        prisma.purchaseReturn.findMany({
          // Status final retur beli = returned (hook mempostingnya seperti
          // itu); "completed" tidak pernah ada → retur tak pernah tampil.
          where: { purchaseOrder: { vendorId: partyId }, status: "returned" },
          select: { id: true, slug: true, documentNo: true, date: true, items: { select: { qty: true, price: true, cost: true } } },
        }),
      ])

      entries = [
        ...bills.map((bill) => ({
          key: `VendorBill:${bill.id}`,
          date: bill.date,
          documentNo: bill.documentNo,
          href: entityHref("/pembelian/tagihan", bill),
          description: "Tagihan Pemasok",
          debit: 0,
          // Utang ke pemasok NETO PPh (PPh dipotong = Hutang PPh), sama
          // dengan aging/PDF; grandTotal penuh menaikkan saldo semu.
          credit: payableOutstanding(bill.grandTotal, bill.withholdingAmount, 0),
        })),
        ...payments.map((pay) => ({
          key: `VendorPayment:${pay.id}`,
          date: pay.paymentDate,
          documentNo: pay.documentNo,
          href: entityHref("/pembelian/pembayaran-vendor", pay),
          description: "Pembayaran Pemasok",
          debit: Number(pay.amount),
          credit: 0,
        })),
        ...returns.map((ret) => ({
          key: `PurchaseReturn:${ret.id}`,
          date: ret.date,
          documentNo: ret.documentNo,
          href: entityHref("/pembelian/retur", ret),
          description: "Retur Pembelian",
          // Relief kanonis hook: harga beku baris (price), legacy jatuh ke
          // cost — BUKAN cost master yang bergerak.
          debit: ret.items.reduce(
            (sum, item) => safeAdd(sum, safeMultiply(Number(item.qty), Number(item.price ?? item.cost), 2), 2),
            0,
          ),
          credit: 0,
        })),
      ]

      outstanding = bills
        .map((bill) => ({
          key: `VendorBill:${bill.id}`,
          documentNo: bill.documentNo,
          href: entityHref("/pembelian/tagihan", bill),
          date: bill.date,
          dueDate: bill.dueDate,
          total: Number(bill.grandTotal),
          paid: Number(bill.paidAmount),
          // Sisa kanonis balanceDue (relief retur sudah mengurangi);
          // formula kop menghidupkan lagi saldo ter-relief.
          remaining: safeSubtract(bill.balanceDue, 0, 2),
        }))
        .filter((row) => row.remaining > 0)
    }

    entries.sort((a, b) => a.date.getTime() - b.date.getTime())
  }

  // AP kredit-normal (samakan PDF loadPayableSubledger): tagihan kredit
  // menaikkan saldo utang. Tanpa arah ini saldo layar jadi negatif.
  const direction = isAr ? "debit" : "credit"
  const opening = openingFromEntries(entries, startDate, direction)
  const card = buildSubledger(periodEntries(entries, startDate, endDate), opening, direction)
  const periodLabel = `Periode ${formatDate(startDate)} – ${formatDate(endDate)}`

  const title = isAr ? "Buku Besar Pembantu Piutang" : "Buku Besar Pembantu Utang"
  const partyLabel = isAr ? "Pelanggan" : "Pemasok"
  const balanceLabel = isAr ? "Saldo Piutang" : "Saldo Utang"
  // Header kolom = sisi akuntansi mentah, sama seperti PDF (Debit/Kredit),
  // supaya nominal tagihan AP memang tampil di kolom Kredit.
  const debitLabel = "Debit"
  const creditLabel = "Kredit"
  const outstandingTitle = isAr ? "Faktur Belum Lunas" : "Tagihan Belum Lunas"

  const totalOutstanding = outstanding.reduce((sum, row) => safeAdd(sum, row.remaining, 2), 0)

  return (
    <div className="flex flex-col gap-6">
      <ReportPeriodFilter
        basePath={basePath}
        mode="range"
        defaultStartDate={toLocalDateOnly(startDate)}
        defaultEndDate={toLocalDateOnly(endDate)}
        selects={[
          {
            param: "pihak",
            label: partyLabel,
            placeholder: `Cari ${partyLabel.toLowerCase()}...`,
            required: true,
            value: selected ? (selected.slug ?? String(selected.id)) : "",
            options: parties.map((p) => ({
              value: p.slug ?? String(p.id),
              label: `${p.code ? `${p.code} — ` : ""}${p.name}`,
            })),
          },
        ]}
      />

      {!selected ? (
        <ReportSection title={title}>
          <p className="py-8 text-center text-sm text-muted-foreground">
            Pilih {partyLabel.toLowerCase()} terlebih dahulu untuk menampilkan buku pembantu.
          </p>
        </ReportSection>
      ) : (
        <>
          <div className="flex items-center justify-end print:hidden">
            <ExportButtons
              title={isAr ? "Buku_Pembantu_Piutang" : "Buku_Pembantu_Utang"}
              pdfHref={buildReportPdfHref(
                isAr ? "buku-pembantu-piutang" : "buku-pembantu-utang",
                buildReportPeriodSlug(startDate, endDate),
                { pihak: selected ? (selected.slug ?? String(selected.id)) : "" },
              )}
            />
          </div>

          <ReportLetterhead
            title={title}
            subtitle={`${selected.code ? `${selected.code} — ` : ""}${selected.name}`}
            periodLabel={periodLabel}
          />
          <ReportNarration
            text={`${title} menampilkan seluruh transaksi yang memengaruhi ${balanceLabel.toLowerCase()} satu ${partyLabel.toLowerCase()} secara kronologis beserta saldo berjalan — faktur/tagihan menambah, pembayaran dan retur mengurangi. Bagian ${outstandingTitle} merangkum dokumen yang belum lunas beserta umurnya, sehingga laporan ini sekaligus berfungsi sebagai pernyataan (statement) yang bisa dikirim ke ${partyLabel.toLowerCase()}.`}
          />

          <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2 print:hidden">
            <ReportKpiCard label={isAr ? "Saldo Awal" : "Saldo Awal (Utang)"} value={formatAccountingExact(card.openingBalance)} />
            <ReportKpiCard label={debitLabel} value={formatAccountingExact(card.totalDebit)} />
            <ReportKpiCard label={creditLabel} value={formatAccountingExact(card.totalCredit)} valueClassName="text-success" />
            <ReportKpiCard label={balanceLabel} value={formatAccountingExact(card.closingBalance)} valueClassName="text-danger" />
          </div>

          <ReportSection title={title}>
            <DetailTable data-report-table={title}>
              <DetailTableHead>
                <DetailTableTh>Tanggal</DetailTableTh>
                <DetailTableTh>Dokumen</DetailTableTh>
                <DetailTableTh>Keterangan</DetailTableTh>
                <DetailTableTh align="right">{debitLabel}</DetailTableTh>
                <DetailTableTh align="right">{creditLabel}</DetailTableTh>
                <DetailTableTh align="right">Saldo</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                <DetailTableRow className="bg-muted/40">
                  <DetailTableTd colSpan={5} className="font-semibold">Saldo Awal</DetailTableTd>
                  <DetailTableTd align="right" className="font-semibold">{formatAccountingExact(card.openingBalance)}</DetailTableTd>
                </DetailTableRow>

                {card.rows.map((row) => (
                  <DetailTableRow key={row.key}>
                    <DetailTableTd>{formatDate(row.date)}</DetailTableTd>
                    <DetailTableTd className="font-mono text-xs">
                      {row.href ? <Link href={row.href} className="text-primary hover:underline">{row.documentNo}</Link> : row.documentNo}
                    </DetailTableTd>
                    <DetailTableTd className="text-xs">{row.description ?? "–"}</DetailTableTd>
                    <DetailTableTd align="right">{row.debit ? formatAccountingExact(row.debit) : "–"}</DetailTableTd>
                    <DetailTableTd align="right">{row.credit ? formatAccountingExact(row.credit) : "–"}</DetailTableTd>
                    <DetailTableTd align="right" className="font-semibold">{formatAccountingExact(row.balance)}</DetailTableTd>
                  </DetailTableRow>
                ))}

                {card.rows.length === 0 && (
                  <DetailTableRow>
                    <DetailTableTd colSpan={6} className="text-center text-muted-foreground py-6">
                      <EmptyState title="Tidak ada transaksi pada periode ini" className="py-0" />
                    </DetailTableTd>
                  </DetailTableRow>
                )}

                <DetailTableRow className="border-t-2 border-default font-bold">
                  <DetailTableTd colSpan={3}>TOTAL</DetailTableTd>
                  <DetailTableTd align="right">{formatAccountingExact(card.totalDebit)}</DetailTableTd>
                  <DetailTableTd align="right">{formatAccountingExact(card.totalCredit)}</DetailTableTd>
                  <DetailTableTd align="right">{formatAccountingExact(card.closingBalance)}</DetailTableTd>
                </DetailTableRow>
              </DetailTableBody>
            </DetailTable>
          </ReportSection>

          <ReportSection title={outstandingTitle}>
            <DetailTable data-report-table={outstandingTitle}>
              <DetailTableHead>
                <DetailTableTh>Dokumen</DetailTableTh>
                <DetailTableTh>Tanggal</DetailTableTh>
                <DetailTableTh>Jatuh Tempo</DetailTableTh>
                <DetailTableTh align="right">Total</DetailTableTh>
                <DetailTableTh align="right">Dibayar</DetailTableTh>
                <DetailTableTh align="right">Sisa</DetailTableTh>
                <DetailTableTh>Umur</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {outstanding.map((row) => (
                  <DetailTableRow key={row.key}>
                    <DetailTableTd className="font-mono text-xs">
                      {row.href ? <Link href={row.href} className="text-primary hover:underline">{row.documentNo}</Link> : row.documentNo}
                    </DetailTableTd>
                    <DetailTableTd>{formatDate(row.date)}</DetailTableTd>
                    <DetailTableTd>{row.dueDate ? formatDate(row.dueDate) : "–"}</DetailTableTd>
                    <DetailTableTd align="right">{formatAccountingExact(row.total)}</DetailTableTd>
                    <DetailTableTd align="right">{formatAccountingExact(row.paid)}</DetailTableTd>
                    <DetailTableTd align="right" className="font-semibold text-danger">{formatAccountingExact(row.remaining)}</DetailTableTd>
                    <DetailTableTd>{row.dueDate ? agingBucket(daysOverdue(row.dueDate, now)) : "–"}</DetailTableTd>
                  </DetailTableRow>
                ))}
                {outstanding.length === 0 && (
                  <DetailTableRow>
                    <DetailTableTd colSpan={7} className="text-center text-muted-foreground py-6">
                      <EmptyState title="Tidak ada dokumen belum lunas" className="py-0" />
                    </DetailTableTd>
                  </DetailTableRow>
                )}
                {outstanding.length > 0 && (
                  <DetailTableRow className="border-t-2 border-default font-bold">
                    <DetailTableTd colSpan={5}>TOTAL</DetailTableTd>
                    <DetailTableTd align="right">{formatAccountingExact(totalOutstanding)}</DetailTableTd>
                    <DetailTableTd>{""}</DetailTableTd>
                  </DetailTableRow>
                )}
              </DetailTableBody>
            </DetailTable>
          </ReportSection>
        </>
      )}
    </div>
  )
}
