import Link from "next/link"

import type { DownPaymentQueueRow } from "@/lib/reports/down-payment-verification-queue"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import { StatusChip } from "@/components/ui/status-chip"
import { DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"

/**
 * Satu baris antrean verifikasi DP (F-2026-10-26-051-S).
 * Seluruh nilai verbatim builder; baris tidak menghitung ulang.
 */
export function DpQueueRow({
  row,
  tones,
}: Readonly<{
  row: DownPaymentQueueRow
  tones: Record<string, "accent" | "default">
}>) {
  return (
    <DetailTableRow key={row.downPaymentId}>
      <DetailTableTd>{row.customerName}</DetailTableTd>
      <DetailTableTd>
        <Link
          href={`/penjualan/uang-muka/${row.downPaymentId}`}
          className="font-medium text-primary hover:underline"
        >
          {row.documentNo}
        </Link>
      </DetailTableTd>
      <DetailTableTd>
        <Link
          href={`/penjualan/penawaran/${row.quotationId}`}
          className="font-medium text-primary hover:underline"
        >
          {row.quotationDocumentNo}
        </Link>
      </DetailTableTd>
      <DetailTableTd>{row.quotationStatus}</DetailTableTd>
      <DetailTableTd>{formatDate(row.paymentDate)}</DetailTableTd>
      <DetailTableTd>{`${row.umurMenungguHari} hari`}</DetailTableTd>
      <DetailTableTd align="right">{formatCurrency(row.amount)}</DetailTableTd>
      <DetailTableTd>{row.buktiLabel}</DetailTableTd>
      <DetailTableTd>
        {row.jarakTeks}
        {row.menungguLainSen > 0 ? (
          <span className="block text-xs text-muted-foreground">
            Menunggu lain {formatCurrency(row.menungguLainSen / 100)} (belum terhitung ambang)
          </span>
        ) : null}
        <span className="block text-xs text-muted-foreground">{row.ambangSumberLabel}</span>
      </DetailTableTd>
      <DetailTableTd>
        <StatusChip
          status={row.tingkat}
          customLabel={row.tingkatLabel}
          customTone={tones[row.tingkat]}
        />
      </DetailTableTd>
      <DetailTableTd>
        <Link
          href={`/penjualan/uang-muka/${row.downPaymentId}`}
          className="inline-flex min-h-11 items-center font-medium text-primary hover:underline"
        >
          Buka Uang Muka
        </Link>
      </DetailTableTd>
    </DetailTableRow>
  )
}
