import Link from "next/link"
import { Gavel } from "lucide-react"

import type { TaxDisputeRegisterQueue } from "@/lib/reports/tax-dispute-register-queue"
import {
  TAX_DISPUTE_REGISTER_COLUMN_LABELS,
  TAX_DISPUTE_REGISTER_TITLE,
} from "@/lib/reports/tax-dispute-register-queue"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import { StatusChip } from "@/components/ui/status-chip"
import { entityHref } from "@/lib/utils/entity-url"
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
} from "@/components/ui/detail-table"
import { EmptyState } from "@/components/ui/empty-state"
import {
  taxDisputeAssessmentKindLabel,
  taxDisputeStatusLabel,
} from "./tax-dispute-labels"

/**
 * Register Ketetapan Pajak + antrean tenggat upaya (113-B).
 * Tempel builder `buildTaxDisputeRegisterQueue` apa adanya: judul, kolom,
 * nominal, tenggat, dan status dirender verbatim — NOL hitung ulang di UI.
 */
export function TaxDisputeRegisterTable({ report }: { report: TaxDisputeRegisterQueue }) {
  if (report.rows.length === 0) {
    return (
      <EmptyState
        icon={<Gavel aria-hidden="true" />}
        title="Belum ada ketetapan pajak"
        description="Daftarkan ketetapan pajak (SKPKB/SKPKBT/SKPLB/SKPN/pemungutan pihak ketiga) untuk memantau tenggat upaya sengketanya di sini."
      />
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-default bg-surface shadow-sm">
      <DetailTable aria-label={TAX_DISPUTE_REGISTER_TITLE}>
        <DetailTableHead>
          <DetailTableTh>{TAX_DISPUTE_REGISTER_COLUMN_LABELS.assessmentNumber}</DetailTableTh>
          <DetailTableTh>{TAX_DISPUTE_REGISTER_COLUMN_LABELS.assessmentKind}</DetailTableTh>
          <DetailTableTh align="right">{TAX_DISPUTE_REGISTER_COLUMN_LABELS.assessedAmount}</DetailTableTh>
          <DetailTableTh align="right">{TAX_DISPUTE_REGISTER_COLUMN_LABELS.disputedAmount}</DetailTableTh>
          <DetailTableTh align="right">{TAX_DISPUTE_REGISTER_COLUMN_LABELS.paidUnderProtest}</DetailTableTh>
          <DetailTableTh>{TAX_DISPUTE_REGISTER_COLUMN_LABELS.stepDeadline}</DetailTableTh>
          <DetailTableTh>Status</DetailTableTh>
        </DetailTableHead>
        <DetailTableBody>
          {report.rows.map((row) => (
            <DetailTableRow key={row.assessmentId}>
              <DetailTableTd>
                <Link
                  href={entityHref("/keuangan/sengketa-pajak", {
                    id: row.assessmentId,
                    slug: row.slug,
                  })}
                  className="font-medium text-primary hover:underline"
                >
                  {row.assessmentNumber ?? `#${row.assessmentId}`}
                </Link>
                {row.lateSteps > 0 && (
                  <span className="ml-2 inline-flex items-center rounded-full border border-transparent bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-500/15 dark:text-red-400">
                    Lewat tenggat
                  </span>
                )}
              </DetailTableTd>
              <DetailTableTd>{taxDisputeAssessmentKindLabel(row.kind)}</DetailTableTd>
              <DetailTableTd align="right">
                {formatCurrency(row.assessedAmount)}
              </DetailTableTd>
              <DetailTableTd align="right">
                {formatCurrency(row.disputedAmount)}
              </DetailTableTd>
              <DetailTableTd align="right">
                {formatCurrency(row.paidUnderProtest)}
              </DetailTableTd>
              <DetailTableTd>{row.nearestDeadline ? formatDate(row.nearestDeadline) : "-"}</DetailTableTd>
              <DetailTableTd>
                <StatusChip status={row.status} customLabel={taxDisputeStatusLabel(row.status)} />
              </DetailTableTd>
            </DetailTableRow>
          ))}
        </DetailTableBody>
      </DetailTable>
    </div>
  )
}
