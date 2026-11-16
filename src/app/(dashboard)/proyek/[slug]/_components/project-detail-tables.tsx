"use client"

import Link from "next/link"
import { useMemo } from "react"
import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { StatusChip } from "@/components/ui/status-chip"
import { entityHref } from "@/lib/utils/entity-url"
import { formatCurrencyExact, formatDate } from "@/lib/utils/format"

export interface ProjectPlanItemRow {
  id: number
  itemId: number | null
  description: string | null
  qty: number
  cost: number
}

export interface ProjectQuotationRow {
  id: number
  slug: string | null
  documentNo: string
  date: string
  grandTotal: number
  status: string
}

export interface ProjectInvoiceRow {
  id: number
  slug: string | null
  documentNo: string | null
  date: string
  grandTotal: number
  paidAmount: number
  status: string
}

export interface ProjectLogRow {
  id: number
  action: string
  notes: string | null
  authorName: string
  createdAt: string
}

const planItemHelper = createColumnHelper<ProjectPlanItemRow>()

export function ProjectPlanItemsTable({
  data,
  canManageBudget,
  labels,
}: Readonly<{
  data: ProjectPlanItemRow[]
  canManageBudget: boolean
  labels?: { qty?: string; cost?: string; total?: string }
}>) {
  const columns = useMemo(
    () => [
      planItemHelper.accessor("description", {
        header: "Deskripsi / Material",
        meta: { mobilePrimary: true },
        cell: (info) => info.getValue() || `Item #${info.row.original.itemId}`,
      }),
      planItemHelper.accessor("qty", {
        header: labels?.qty ?? "Jml Rencana",
        meta: { align: "right" },
        cell: (info) => <span className="font-mono tabular-nums">{info.getValue()}</span>,
      }),
      ...(canManageBudget
        ? [
            planItemHelper.accessor("cost", {
              header: labels?.cost ?? "Biaya Satuan Rencana",
              meta: { align: "right" },
              cell: (info) => (
                <span className="font-mono tabular-nums">
                  {formatCurrencyExact(info.getValue())}
                </span>
              ),
            }),
            planItemHelper.display({
              id: "totalRencana",
              header: labels?.total ?? "Total Rencana",
              meta: { align: "right" },
              cell: (info) => {
                const row = info.row.original
                return (
                  <span className="font-mono tabular-nums">
                    {formatCurrencyExact(row.qty * row.cost)}
                  </span>
                )
              },
            }),
          ]
        : []),
    ],
    [canManageBudget, labels],
  )

  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Rencana Bahan dan Komponen"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}

const quotationHelper = createColumnHelper<ProjectQuotationRow>()
const quotationColumns = [
  quotationHelper.accessor("documentNo", {
    header: "No. Dokumen",
    meta: { mobilePrimary: true },
    cell: (info) => (
      <Link
        href={entityHref("/penjualan/penawaran", info.row.original)}
        className="font-mono font-medium text-foreground hover:underline"
      >
        {info.getValue()}
      </Link>
    ),
  }),
  quotationHelper.accessor("date", {
    header: "Tanggal",
    cell: (info) => formatDate(info.getValue()),
  }),
  quotationHelper.accessor("grandTotal", {
    header: "Total",
    meta: { align: "right" },
    cell: (info) => (
      <span className="font-mono tabular-nums">{formatCurrencyExact(info.getValue())}</span>
    ),
  }),
  quotationHelper.accessor("status", {
    header: "Status",
    cell: (info) => <StatusChip status={info.getValue()} />,
  }),
]

export function ProjectQuotationsTable({
  data,
}: Readonly<{ data: ProjectQuotationRow[] }>) {
  return (
    <DataTable
      data={data}
      columns={quotationColumns}
      ariaLabel="Riwayat Penawaran"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}

const invoiceHelper = createColumnHelper<ProjectInvoiceRow>()
const invoiceColumns = [
  invoiceHelper.accessor("documentNo", {
    header: "No. Dokumen",
    meta: { mobilePrimary: true },
    cell: (info) => (
      <Link
        href={entityHref("/penjualan/faktur", info.row.original)}
        className="font-mono font-medium text-foreground hover:underline"
      >
        {info.getValue() || "-"}
      </Link>
    ),
  }),
  invoiceHelper.accessor("date", {
    header: "Tanggal",
    cell: (info) => formatDate(info.getValue()),
  }),
  invoiceHelper.accessor("grandTotal", {
    header: "Total",
    meta: { align: "right" },
    cell: (info) => (
      <span className="font-mono tabular-nums">{formatCurrencyExact(info.getValue())}</span>
    ),
  }),
  invoiceHelper.accessor("paidAmount", {
    header: "Terbayar",
    meta: { align: "right" },
    cell: (info) => (
      <span className="font-mono tabular-nums">{formatCurrencyExact(info.getValue())}</span>
    ),
  }),
  invoiceHelper.accessor("status", {
    header: "Status",
    cell: (info) => <StatusChip status={info.getValue()} />,
  }),
]

export function ProjectInvoicesTable({
  data,
}: Readonly<{ data: ProjectInvoiceRow[] }>) {
  return (
    <DataTable
      data={data}
      columns={invoiceColumns}
      ariaLabel="Tagihan dan Pembayaran"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}

function getActionBadgeClass(action: string): string {
  if (action === "Kendala") {
    return "border-red-200/80 bg-red-50 text-red-800 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300"
  }
  if (action === "Keputusan") {
    return "border-blue-200/80 bg-blue-50 text-blue-800 dark:border-blue-500/25 dark:bg-blue-500/10 dark:text-blue-300"
  }
  if (action === "Progres") {
    return "border-emerald-200/80 bg-emerald-50 text-emerald-800 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300"
  }
  if (action === "Kunjungan") {
    return "border-amber-200/80 bg-amber-50 text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300"
  }
  if (action.startsWith("rab_")) {
    return "border-purple-200/80 bg-purple-50 text-purple-800 dark:border-purple-500/25 dark:bg-purple-500/10 dark:text-purple-300 font-mono text-[10px]"
  }
  return "border-border bg-muted/50 text-muted-foreground"
}

function getActionLabel(action: string): string {
  switch (action) {
    case "rab_locked":
      return "RAB Dikunci"
    case "rab_revision_proposed":
      return "Usulan Revisi RAB"
    case "rab_revision":
      return "Revisi RAB Disetujui"
    case "rab_revision_rejected":
      return "Revisi RAB Ditolak"
    case "rab_contract_snapshot":
      return "Snapshot Kontrak RAB"
    case "rab_contract_manual":
      return "Kontrak Manual RAB"
    default:
      return action
  }
}

const logHelper = createColumnHelper<ProjectLogRow>()
const logColumns = [
  logHelper.accessor("action", {
    header: "Aksi",
    cell: (info) => {
      const action = info.getValue()
      return (
        <span
          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${getActionBadgeClass(action)}`}
        >
          {getActionLabel(action)}
        </span>
      )
    },
  }),
  logHelper.accessor("notes", {
    header: "Catatan / Keterangan",
    meta: { mobilePrimary: true },
    cell: (info) => (
      <span className="whitespace-pre-wrap leading-relaxed text-sm">
        {info.getValue() || "-"}
      </span>
    ),
  }),
  logHelper.accessor("authorName", {
    header: "Dicatat Oleh",
    cell: (info) => (
      <span className="text-xs text-muted-foreground font-medium">{info.getValue()}</span>
    ),
  }),
  logHelper.accessor("createdAt", {
    header: "Waktu (WIB)",
    cell: (info) => (
      <span className="text-xs tabular-nums text-muted-foreground">
        {formatDate(info.getValue(), { format: "short", includeTime: true })}
      </span>
    ),
  }),
]

export function ProjectLogsTable({ data }: Readonly<{ data: ProjectLogRow[] }>) {
  return (
    <DataTable
      data={data}
      columns={logColumns}
      ariaLabel="Log Aktivitas dan Logbook"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}
