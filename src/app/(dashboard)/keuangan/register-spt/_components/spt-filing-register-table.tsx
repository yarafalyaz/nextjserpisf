"use client"

import { formatCurrencyExact, formatDate } from "@/lib/utils/format"
import { SPT_TYPE_LABELS, type SptType } from "@/lib/validations/spt-filing.schemas"
import type { SptFilingRow } from "@/lib/reports/spt-filing-data"

interface SptFilingRegisterTableProps {
  rows: SptFilingRow[]
}

export function SptFilingRegisterTable({ rows }: Readonly<SptFilingRegisterTableProps>) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <p className="text-sm font-medium text-foreground">Belum ada catatan pelaporan SPT.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Catat setiap penyampaian SPT (Normal maupun Pembetulan) beserta nomor BPE dan saldo kompensasi Coretax.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-card shadow-2xs overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-border bg-muted/40 text-2xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Masa</th>
              <th className="px-4 py-3 font-medium">Jenis SPT</th>
              <th className="px-4 py-3 font-medium">Versi</th>
              <th className="px-4 py-3 font-medium">Tanggal Lapor</th>
              <th className="px-4 py-3 font-medium">Nomor BPE</th>
              <th className="px-4 py-3 font-medium text-right">Kurang/(Lebih) Bayar</th>
              <th className="px-4 py-3 font-medium text-right">Saldo Kompensasi Coretax</th>
              <th className="px-4 py-3 font-medium">Setoran Pajak</th>
              <th className="px-4 py-3 font-medium">Catatan Selisih</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => {
              const typeLabel =
                SPT_TYPE_LABELS[row.sptType as SptType] ?? row.sptType.toUpperCase()
              const versionLabel =
                row.amendmentNo === 0 ? "Normal" : `Pembetulan-${row.amendmentNo}`
              return (
                <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-mono tabular-nums whitespace-nowrap text-foreground">
                    {row.period}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-foreground">
                    {typeLabel}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={
                          row.amendmentNo === 0
                            ? "inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-2xs font-medium text-foreground"
                            : "inline-flex items-center rounded-md bg-amber-500/15 px-2 py-0.5 text-2xs font-medium text-amber-700 dark:text-amber-300"
                        }
                      >
                        {versionLabel}
                      </span>
                      {row.isLatestForKey ? (
                        <span className="inline-flex items-center rounded-md bg-emerald-500/15 px-2 py-0.5 text-2xs font-medium text-emerald-700 dark:text-emerald-300">
                          Berlaku
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono tabular-nums whitespace-nowrap text-muted-foreground">
                    {formatDate(row.filedAt, { format: "short" })}
                  </td>
                  <td className="px-4 py-3 font-mono tabular-nums whitespace-nowrap text-foreground">
                    {row.bpeNumber}
                  </td>
                  <td className="px-4 py-3 font-mono tabular-nums text-right whitespace-nowrap text-foreground">
                    {formatCurrencyExact(row.underOverPayment)}
                  </td>
                  <td className="px-4 py-3 font-mono tabular-nums text-right whitespace-nowrap text-foreground">
                    {formatCurrencyExact(row.compensationBalance)}
                  </td>
                  <td className="px-4 py-3 font-mono tabular-nums whitespace-nowrap text-muted-foreground">
                    {row.taxPaymentDocNo ?? "-"}
                  </td>
                  <td className="px-4 py-3 max-w-xs text-muted-foreground">
                    {row.varianceNote ?? "-"}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
