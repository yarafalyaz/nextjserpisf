import Link from "next/link"
import { entityHref } from "@/lib/utils/entity-url"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import { StatusChip } from "@/components/ui/status-chip"
import { DetailTableTd } from "@/components/ui/detail-table"

/** Sel dokumen penawaran (tautan detail) bersama kartu antrean penawaran. */
export function QuotationDocumentCell({
  quotationId,
  slug,
  documentNo,
}: Readonly<{
  quotationId: number
  slug: string | null
  documentNo: string
}>) {
  return (
    <DetailTableTd>
      <Link
        href={entityHref("/penjualan/penawaran", { id: quotationId, slug })}
        className="font-medium text-primary hover:underline"
      >
        {documentNo}
      </Link>
    </DetailTableTd>
  )
}

/** Sel penjual bersama kartu antrean penawaran. */
export function QuotationSalesCell({
  salesEmployeeName,
}: Readonly<{ salesEmployeeName: string | null }>) {
  return <DetailTableTd>{salesEmployeeName ?? "—"}</DetailTableTd>
}

/** Sel masa berlaku bersama kartu antrean penawaran. */
export function QuotationValidUntilCell({
  validUntil,
}: Readonly<{ validUntil: Date | null }>) {
  return (
    <DetailTableTd>
      {validUntil ? formatDate(validUntil) : "—"}
    </DetailTableTd>
  )
}

/** Sel sisa hari verbatim builder bersama kartu antrean penawaran. */
export function QuotationRemainingDaysCell({
  sisaHari,
}: Readonly<{ sisaHari: number | null }>) {
  return (
    <DetailTableTd align="right">
      {sisaHari === null ? "—" : `${sisaHari} hari`}
    </DetailTableTd>
  )
}

/** Sel nilai bersama kartu antrean penawaran. */
export function QuotationGrandTotalCell({
  grandTotal,
}: Readonly<{ grandTotal: number }>) {
  return (
    <DetailTableTd align="right">{formatCurrency(grandTotal)}</DetailTableTd>
  )
}

/** Sel tahap verbatim builder (status + label + tone) bersama kartu antrean. */
export function QuotationStageCell({
  tahap,
  tahapLabel,
  tone,
}: Readonly<{
  tahap: string
  tahapLabel: string
  tone: "danger" | "warning" | "accent" | "default"
}>) {
  return (
    <DetailTableTd>
      <StatusChip status={tahap} customLabel={tahapLabel} customTone={tone} />
    </DetailTableTd>
  )
}
