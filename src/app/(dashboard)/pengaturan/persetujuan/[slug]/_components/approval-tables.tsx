"use client"

import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { StatusChip } from "@/components/ui/status-chip"
import { formatCurrencyExact, formatDate } from "@/lib/utils/format"

export interface ApprovalJournalEntryRow {
  id: number
  accountCode: string
  accountName: string
  memo: string | null
  debit: number
  credit: number
}

export interface ApprovalHistoryRow {
  id: number
  step: number
  action: string
  actorName: string
  notes: string | null
  createdAt: string
}

const journalColumnHelper = createColumnHelper<ApprovalJournalEntryRow>()

const journalColumns = [
  journalColumnHelper.accessor("accountCode", {
    header: "Kode Akun",
    cell: (info) => (
      <span className="font-mono text-xs font-medium text-foreground tabular-nums">
        {info.getValue()}
      </span>
    ),
  }),
  journalColumnHelper.accessor("accountName", {
    header: "Nama Akun",
    meta: { mobilePrimary: true },
    cell: (info) => (
      <span className="font-medium text-foreground">{info.getValue()}</span>
    ),
  }),
  journalColumnHelper.accessor("memo", {
    header: "Memo",
    cell: (info) => (
      <span className="text-muted-foreground">{info.getValue() || "-"}</span>
    ),
  }),
  journalColumnHelper.accessor("debit", {
    header: "Debit",
    meta: { align: "right" },
    cell: (info) => (
      <span className="font-mono tabular-nums text-foreground">
        {info.getValue() > 0 ? formatCurrencyExact(info.getValue()) : "-"}
      </span>
    ),
  }),
  journalColumnHelper.accessor("credit", {
    header: "Kredit",
    meta: { align: "right" },
    cell: (info) => (
      <span className="font-mono tabular-nums text-foreground">
        {info.getValue() > 0 ? formatCurrencyExact(info.getValue()) : "-"}
      </span>
    ),
  }),
]

export function ApprovalJournalPreviewTable({
  data,
  totalDebit,
  totalCredit,
}: {
  data: ApprovalJournalEntryRow[]
  totalDebit: number
  totalCredit: number
}) {
  return (
    <div className="flex flex-col gap-3">
      <DataTable
        data={data}
        columns={journalColumns}
        ariaLabel="Pratinjau Baris Jurnal"
        selectable={false}
        enableColumnToggle={false}
        enableExport={false}
        pageSize={50}
      />
      <div className="flex flex-wrap items-center justify-end gap-6 rounded-lg border border-default bg-surface-muted/40 px-4 py-2.5 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Total Debit:</span>
          <span className="font-semibold font-mono tabular-nums text-foreground">
            {formatCurrencyExact(totalDebit)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Total Kredit:</span>
          <span className="font-semibold font-mono tabular-nums text-foreground">
            {formatCurrencyExact(totalCredit)}
          </span>
        </div>
      </div>
    </div>
  )
}

const historyColumnHelper = createColumnHelper<ApprovalHistoryRow>()

const historyColumns = [
  historyColumnHelper.accessor("step", {
    header: "Langkah",
    cell: (info) => (
      <span className="font-medium text-foreground tabular-nums">
        Langkah {info.getValue()}
      </span>
    ),
  }),
  historyColumnHelper.accessor("action", {
    header: "Aksi",
    cell: (info) => (
      <StatusChip
        status={info.getValue() === "approve" ? "approved" : "rejected"}
        customLabel={info.getValue() === "approve" ? "Disetujui" : "Ditolak"}
      />
    ),
  }),
  historyColumnHelper.accessor("actorName", {
    header: "Oleh",
    meta: { mobilePrimary: true },
    cell: (info) => (
      <span className="font-medium text-foreground">{info.getValue()}</span>
    ),
  }),
  historyColumnHelper.accessor("notes", {
    header: "Catatan",
    cell: (info) => (
      <span className="text-muted-foreground">{info.getValue() || "-"}</span>
    ),
  }),
  historyColumnHelper.accessor("createdAt", {
    header: "Waktu",
    cell: (info) => (
      <span className="text-muted-foreground tabular-nums">
        {formatDate(info.getValue(), { includeTime: true })}
      </span>
    ),
  }),
]

export function ApprovalHistoryTable({ data }: { data: ApprovalHistoryRow[] }) {
  return (
    <DataTable
      data={data}
      columns={historyColumns}
      ariaLabel="Riwayat Persetujuan"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={20}
    />
  )
}
