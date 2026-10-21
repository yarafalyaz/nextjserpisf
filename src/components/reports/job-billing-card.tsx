import Link from "next/link"
import { entityHref } from "@/lib/utils/entity-url"
import type { JobBillingSummaryResult } from "@/lib/reports/job-billing-summary-data"
import { formatCurrency } from "@/lib/utils/format"

function Baris({ label, value, bold }: Readonly<{ label: string; value: number; bold?: boolean }>) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className={bold ? "text-sm font-semibold tabular-nums" : "text-sm tabular-nums"}>{formatCurrency(value)}</dd>
    </div>
  )
}

export function JobBillingCard({
  summary,
  deltaNilaiCents,
}: Readonly<{
  summary: JobBillingSummaryResult
  /** F-107: delta nilai berjalan vs snapshot revisi terakhir, sen (QuotationRevisionDelta.deltaCents); null/tak diberikan = tak tercatat. */
  deltaNilaiCents?: number | null
}>) {
  const terminDelta =
    deltaNilaiCents === null || deltaNilaiCents === undefined || deltaNilaiCents === 0
      ? null
      : {
          naik: deltaNilaiCents > 0,
          nominal: formatCurrency(Math.abs(deltaNilaiCents) / 100),
          // ponytail: persen presentasi saja dari 2 field builder existing; NaN hanya bila snapshot <=0 (grandTotal sen <=0) — guard null.
          persen:
            summary.nilaiBerjalan * 100 - deltaNilaiCents > 0
              ? (Math.abs(deltaNilaiCents) / (summary.nilaiBerjalan * 100 - deltaNilaiCents)) * 100
              : null,
        }
  return (
    <section aria-label={`Ringkasan tagihan ${summary.quotationDocumentNo}`} className="rounded-xl border border-default bg-surface p-5 shadow-sm">
      <h2 className="text-base font-semibold">Tagihan Berjalan — {summary.quotationDocumentNo}</h2>
      {summary.overbilled ? (
        <p role="alert" className="mt-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Overbilled: sudah ditagih melebihi nilai berjalan sebesar {formatCurrency(-summary.sisaBelumDitagih)}.
        </p>
      ) : null}
      <dl className="mt-3 divide-y divide-default">
        <Baris label="Nilai berjalan" value={summary.nilaiBerjalan} bold />
        <Baris label="Sudah ditagih" value={summary.sudahDitagih} />
        <Baris label="Sudah dibayar" value={summary.sudahDibayar} />
        <Baris label="Sisa belum ditagih" value={summary.sisaBelumDitagih} bold />
        <Baris label="Sisa belum dibayar" value={summary.sisaBelumDibayar} />
        <Baris label="Uang muka diterima" value={summary.uangMukaDiterima} />
        {summary.ambangInvoiceTercapai ? (
          <p className="py-1.5 text-sm text-muted-foreground">Ambang invoice konversi DP tercapai ({formatCurrency(summary.ambangInvoice)}).</p>
        ) : (
          <Baris label="Kekurangan DP menuju invoice" value={summary.jarakKeAmbangInvoice} />
        )}
        {summary.kreditTerbuka > 0 ? (
          <>
            <Baris label="Kredit terbuka (bukan tagihan)" value={summary.kreditTerbuka} />
            <Baris label="Sisa efektif" value={summary.sisaEfektif} bold />
          </>
        ) : null}
      </dl>
      {terminDelta ? (
        <section aria-label="Delta nilai termin" className="mt-4 border-t border-default pt-3">
          <h3 className="text-sm font-semibold">Perubahan nilai sejak snapshot revisi terakhir</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Delta turunan dari snapshot, bukan amendemen jadwal</p>
          <dl className="mt-1 divide-y divide-default">
            <div className="flex items-center justify-between gap-4 py-1.5">
              <dt className="text-sm text-muted-foreground">
                {terminDelta.naik ? "Nilai naik — sisa tagih bertambah" : "Nilai turun — kelebihan menjadi kredit pelanggan"}
              </dt>
              <dd
                className={
                  terminDelta.naik
                    ? "text-sm font-semibold tabular-nums text-destructive"
                    : "text-sm font-semibold tabular-nums text-emerald-600"
                }
              >
                {`${terminDelta.naik ? "+" : "−"}${terminDelta.nominal}${terminDelta.persen === null ? "" : ` (${terminDelta.persen.toFixed(1).replace(".", ",")}%)`}`}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 py-1.5">
              <dt className="text-sm text-muted-foreground">Sisa belum ditagih kini</dt>
              <dd className="text-sm font-semibold tabular-nums">{formatCurrency(summary.sisaBelumDitagih)}</dd>
            </div>
          </dl>
        </section>
      ) : (
        <p className="mt-4 border-t border-default pt-3 text-xs text-muted-foreground">Perubahan nilai sejak snapshot tidak tercatat</p>
      )}
      {summary.kreditTerbuka > 0 && summary.openCredits.length > 0 ? (
        <ul aria-label="Kredit terbuka" className="mt-3 space-y-1 text-sm">
          {summary.openCredits.map((c) => (
            <li key={c.id} className="flex justify-between gap-4">
              <span>{c.documentNo}</span>
              <span className="tabular-nums">{formatCurrency(c.saldo)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {summary.billedInvoices.length > 0 ? (
        <ul aria-label="Invoice terhitung" className="mt-3 space-y-1 text-sm">
          {summary.billedInvoices.map((inv) => (
            <li key={inv.id} className="flex justify-between gap-4">
              <span>{inv.documentNo} · {inv.status}</span>
              <span className="tabular-nums">{formatCurrency(inv.grandTotal)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">Belum ada invoice posted untuk penawaran ini.</p>
      )}
      {summary.workOrders.length > 0 ? (
        <ul aria-label="Perintah kerja terkait" className="mt-3 flex flex-wrap gap-2 text-sm">
          {summary.workOrders.map((wo) => (
            <li key={wo.id}>
              <Link href={entityHref("/produksi/perintah-kerja", wo)} className="underline underline-offset-2">{wo.documentNo}</Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
