import Link from "next/link"
import type {
  AcceptedQuotationRow,
  AcceptedQuotationStage,
} from "@/lib/reports/quotation-accepted-queue"
import { ACCEPTED_QUOTATION_QUEUE_NOTICE_TEXT } from "@/lib/reports/quotation-accepted-queue"
import { entityHref } from "@/lib/utils/entity-url"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
} from "@/components/ui/detail-table"
import {
  QuotationDocumentCell,
  QuotationGrandTotalCell,
  QuotationRemainingDaysCell,
  QuotationSalesCell,
  QuotationStageCell,
  QuotationValidUntilCell,
} from "./quotation-queue-cells"

const STAGE_TONES: Record<
  AcceptedQuotationStage,
  "danger" | "warning" | "accent" | "default"
> = {
  MASA_BERLAKU_LEWAT: "danger",
  MENGENDAP: "warning",
  MENUNGGU_TINDAK_LANJUT: "accent",
  PERNAH_DIKONVERSI_SO_BATAL: "default",
}

const TITLE = "Antrean Penawaran Diterima"

/** Fakta pendamping DP verbatim server (BR-AQ-07): bukan bukti konversi. */
function dpFactText(row: AcceptedQuotationRow): string | null {
  const parts: string[] = []
  if (row.dpPendingCount > 0) {
    parts.push(`menunggu ${row.dpPendingCount} (${formatCurrency(row.dpPendingTotal)})`)
  }
  if (row.dpConfirmedCount > 0) {
    parts.push(`terkonfirmasi ${row.dpConfirmedCount} (${formatCurrency(row.dpConfirmedTotal)})`)
  }
  return parts.length > 0 ? `Uang muka: ${parts.join(", ")}` : null
}

/** Fakta dokumen tertaut verbatim server (BR-AQ-03): bukan label konversi. */
function linkedFactText(row: AcceptedQuotationRow): string | null {
  const parts: string[] = []
  if (row.pernahDikonversiSoBatal) {
    const cancelled = row.salesOrders.filter(
      (so) => so.status.toLowerCase() === "cancelled",
    )
    parts.push(
      `Pesanan penjualan dibatalkan: ${cancelled.map((so) => so.documentNo).join(", ")}`,
    )
  }
  if (row.punyaWorkOrderTertaut) {
    parts.push(`Order kerja tertaut: ${row.workOrders.map((wo) => wo.documentNo).join(", ")}`)
  }
  if (row.punyaSalesInvoiceTertaut) {
    parts.push(`Faktur tertaut: ${row.salesInvoices.map((inv) => inv.documentNo).join(", ")}`)
  }
  return parts.length > 0 ? parts.join(" · ") : null
}

/**
 * F-2026-10-25-002-S: antrean penawaran diterima belum menjadi pesanan
 * penjualan. Tahap/umur/sisa/fakta dari builder server apa adanya; UI
 * tidak menghitung ulang tanggal (AC-AQ-F1). Urutan baris final dari
 * builder — tidak diurut ulang di sini. Aksi hanya tautan ke permukaan
 * existing (detail penawaran, buat pesanan penjualan, buat uang muka);
 * antrean tidak membuat dokumen sendiri (AC-AQ-F2). Baris masa berlaku
 * lewat tetap tampil tertanda (tahap dari server).
 */
export function AcceptedQuotationQueueCard({
  rows,
  canCreateSalesOrder,
  canCreateDownPayment,
}: Readonly<{
  rows: AcceptedQuotationRow[]
  /** Izin create_sales_orders pemanggil (server) — tautan konversi. */
  canCreateSalesOrder: boolean
  /** Izin create_down_payments pemanggil (server) — tautan uang muka. */
  canCreateDownPayment: boolean
}>) {
  return (
    <section
      aria-label={TITLE}
      className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 px-5 border-b border-default">
        <h2 className="text-[0.9375rem] font-semibold text-foreground">{TITLE}</h2>
      </div>
      <div className="p-4 px-5">
        <p className="text-xs text-muted-foreground">
          {rows.length} penawaran diterima belum menjadi pesanan penjualan
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {ACCEPTED_QUOTATION_QUEUE_NOTICE_TEXT}
        </p>
        {rows.length === 0 ? (
          <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            Belum ada penawaran diterima yang menunggu tindak lanjut
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>Pelanggan</DetailTableTh>
                <DetailTableTh>No. Penawaran</DetailTableTh>
                <DetailTableTh>Penjual</DetailTableTh>
                <DetailTableTh>Kendaraan</DetailTableTh>
                <DetailTableTh>Diterima</DetailTableTh>
                <DetailTableTh align="right">Umur Terima</DetailTableTh>
                <DetailTableTh>Masa Berlaku</DetailTableTh>
                <DetailTableTh align="right">Sisa Hari</DetailTableTh>
                <DetailTableTh align="right">Nilai</DetailTableTh>
                <DetailTableTh>Tahap</DetailTableTh>
                <DetailTableTh>Fakta Tertaut</DetailTableTh>
                <DetailTableTh>Aksi</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {rows.map((row) => {
                  const dpFact = dpFactText(row)
                  const linkedFact = linkedFactText(row)
                  const detailHref = entityHref("/penjualan/penawaran", {
                    id: row.quotationId,
                    slug: row.slug,
                  })
                  // Tautan existing dari detail penawaran (pola page [slug]):
                  // konversi hanya bila belum ada pesanan penjualan tertaut.
                  const showConvert =
                    canCreateSalesOrder && row.salesOrders.length === 0
                  return (
                    <DetailTableRow key={row.quotationId}>
                      <DetailTableTd>
                        {row.customerName}
                        {row.contactPerson ? (
                          <span className="block text-xs text-muted-foreground">
                            {row.contactPerson}
                          </span>
                        ) : null}
                      </DetailTableTd>
                      <QuotationDocumentCell
                        quotationId={row.quotationId}
                        slug={row.slug}
                        documentNo={row.documentNo}
                      />
                      <QuotationSalesCell salesEmployeeName={row.salesEmployeeName} />
                      <DetailTableTd>{row.customerVehicleLabel ?? "—"}</DetailTableTd>
                      <DetailTableTd>
                        {row.acceptedAt ? formatDate(row.acceptedAt) : "—"}
                      </DetailTableTd>
                      <DetailTableTd align="right">
                        {row.umurTerimaHari === null
                          ? row.umurTerimaLabel
                          : `${row.umurTerimaLabel} hari`}
                      </DetailTableTd>
                      <QuotationValidUntilCell validUntil={row.validUntil} />
                      <QuotationRemainingDaysCell sisaHari={row.sisaHari} />
                      <QuotationGrandTotalCell grandTotal={row.grandTotal} />
                      <QuotationStageCell
                        tahap={row.tahap}
                        tahapLabel={row.tahapLabel}
                        tone={STAGE_TONES[row.tahap]}
                      />
                      <DetailTableTd>
                        {dpFact || linkedFact ? (
                          <span className="text-xs text-muted-foreground">
                            {dpFact}
                            {dpFact && linkedFact ? " · " : ""}
                            {linkedFact}
                          </span>
                        ) : (
                          "—"
                        )}
                      </DetailTableTd>
                      <DetailTableTd>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                          <Link
                            href={detailHref}
                            className="inline-flex min-h-11 items-center font-medium text-primary hover:underline sm:min-h-9"
                          >
                            Buka Penawaran
                          </Link>
                          {showConvert ? (
                            <Link
                              href={`/penjualan/pesanan/tambah/penawaran/${row.slug ?? row.quotationId}`}
                              className="inline-flex min-h-11 items-center font-medium text-primary hover:underline sm:min-h-9"
                            >
                              Buat Pesanan Penjualan
                            </Link>
                          ) : null}
                          {canCreateDownPayment ? (
                            <Link
                              href={`/penjualan/uang-muka/tambah/penawaran/${row.slug ?? row.quotationId}`}
                              className="inline-flex min-h-11 items-center font-medium text-primary hover:underline sm:min-h-9"
                            >
                              Buat Uang Muka
                            </Link>
                          ) : null}
                        </div>
                      </DetailTableTd>
                    </DetailTableRow>
                  )
                })}
              </DetailTableBody>
            </DetailTable>
          </div>
        )}
      </div>
    </section>
  )
}
