"use client"

import Link from "next/link"
import { Gavel } from "@/components/ui/fontawesome-icons"
import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"

import type { TaxDisputeRegisterQueue } from "@/lib/reports/tax-dispute-register-queue"
import {
  TAX_DISPUTE_REGISTER_COLUMN_LABELS,
  TAX_DISPUTE_REGISTER_TITLE,
} from "@/lib/reports/tax-dispute-register-queue"
import { formatCurrencyExact, formatDate } from "@/lib/utils/format"
import { StatusChip } from "@/components/ui/status-chip"
import { entityHref } from "@/lib/utils/entity-url"
import { EmptyState } from "@/components/ui/empty-state"
import {
  taxDisputeAssessmentKindLabel,
  taxDisputeStatusLabel,
} from "./tax-dispute-labels"

type TaxDisputeRegisterRow = TaxDisputeRegisterQueue["rows"][number] & { id: number }

const columnHelper = createColumnHelper<TaxDisputeRegisterRow>()

const columns = [
  columnHelper.accessor("assessmentNumber", {
    header: TAX_DISPUTE_REGISTER_COLUMN_LABELS.assessmentNumber,
    meta: { mobilePrimary: true },
    cell: (info) => {
      const row = info.row.original
      return (
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={entityHref("/keuangan/sengketa-pajak", {
              id: row.assessmentId,
              slug: row.slug,
            })}
            className="font-mono font-medium text-primary hover:underline"
          >
            {row.assessmentNumber ?? `#${row.assessmentId}`}
          </Link>
          {row.lateSteps > 0 && (
            <span className="inline-flex items-center rounded-full border border-transparent bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-500/15 dark:text-red-400">
              Lewat tenggat
            </span>
          )}
        </div>
      )
    },
  }),
  columnHelper.accessor("kind", {
    header: TAX_DISPUTE_REGISTER_COLUMN_LABELS.assessmentKind,
    cell: (info) => taxDisputeAssessmentKindLabel(info.getValue()),
  }),
  columnHelper.accessor("assessedAmount", {
    header: TAX_DISPUTE_REGISTER_COLUMN_LABELS.assessedAmount,
    meta: { align: "right" },
    cell: (info) => (
      <span className="block text-right font-mono tabular-nums">
        {formatCurrencyExact(info.getValue())}
      </span>
    ),
  }),
  columnHelper.accessor("disputedAmount", {
    header: TAX_DISPUTE_REGISTER_COLUMN_LABELS.disputedAmount,
    meta: { align: "right" },
    cell: (info) => (
      <span className="block text-right font-mono tabular-nums">
        {formatCurrencyExact(info.getValue())}
      </span>
    ),
  }),
  columnHelper.accessor("paidUnderProtest", {
    header: TAX_DISPUTE_REGISTER_COLUMN_LABELS.paidUnderProtest,
    meta: { align: "right" },
    cell: (info) => (
      <span className="block text-right font-mono tabular-nums">
        {formatCurrencyExact(info.getValue())}
      </span>
    ),
  }),
  columnHelper.accessor("nearestDeadline", {
    header: TAX_DISPUTE_REGISTER_COLUMN_LABELS.stepDeadline,
    cell: (info) => {
      const val = info.getValue()
      return <span className="font-mono tabular-nums">{val ? formatDate(val) : "-"}</span>
    },
  }),
  columnHelper.accessor("status", {
    header: "Status",
    cell: (info) => {
      const status = info.getValue()
      return <StatusChip status={status} customLabel={taxDisputeStatusLabel(status)} />
    },
  }),
]

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
    <DataTable
      data={report.rows.map((r) => ({ ...r, id: r.assessmentId }))}
      columns={columns}
      ariaLabel={TAX_DISPUTE_REGISTER_TITLE}
    />
  )
}
