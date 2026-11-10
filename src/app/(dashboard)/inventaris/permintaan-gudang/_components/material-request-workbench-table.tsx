"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { StatusChip } from "@/components/ui/status-chip"
import { entityHref } from "@/lib/utils/entity-url"
import { formatDate, formatNumber } from "@/lib/utils/format"
import { ArrowDown, ArrowUp, Clock } from "@/components/ui/fontawesome-icons"
import type { MaterialRequestQueueRow } from "@/lib/reports/material-request-data"

export interface MaterialRequestWorkbenchItem extends MaterialRequestQueueRow {
  direction: "incoming" | "outgoing"
}

const columnHelper = createColumnHelper<MaterialRequestWorkbenchItem>()

const columns = [
  columnHelper.accessor("documentNo", {
    header: "No. Dokumen",
    cell: (info) => {
      const row = info.row.original
      return (
        <div className="flex items-center gap-2">
          <Link
            href={entityHref("/inventaris/permintaan-gudang", row)}
            className="font-mono font-medium text-primary hover:underline"
          >
            {row.documentNo}
          </Link>
          {row.isOverdue && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 border border-red-200 dark:border-red-800">
              <Clock className="size-2.5" /> Terlambat
            </span>
          )}
        </div>
      )
    },
  }),
  columnHelper.accessor("direction", {
    header: "Alur",
    cell: (info) => {
      const isIncoming = info.getValue() === "incoming"
      return (
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border ${
            isIncoming
              ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800"
              : "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800"
          }`}
        >
          {isIncoming ? (
            <>
              <ArrowDown className="size-2.5" /> Masuk
            </>
          ) : (
            <>
              <ArrowUp className="size-2.5" /> Keluar
            </>
          )}
        </span>
      )
    },
  }),
  columnHelper.accessor("sourceWarehouseName", {
    header: "Gudang Penyedia",
    cell: (info) => <span className="font-medium text-foreground">{info.getValue()}</span>,
  }),
  columnHelper.accessor("requesterWarehouseName", {
    header: "Gudang Peminta",
    cell: (info) => <span className="font-medium text-foreground">{info.getValue()}</span>,
  }),
  columnHelper.accessor("workOrderDocumentNo", {
    header: "Perintah Kerja",
    cell: (info) => {
      const val = info.getValue()
      return val ? <span className="font-mono text-xs">{val}</span> : <span className="text-muted-foreground">-</span>
    },
  }),
  columnHelper.accessor("neededBy", {
    header: "Jatuh Tempo",
    cell: (info) => {
      const val = info.getValue()
      return val ? (
        <span className="font-mono text-xs">{formatDate(val)}</span>
      ) : (
        <span className="text-muted-foreground">-</span>
      )
    },
  }),
  columnHelper.accessor("lines", {
    header: "Baris",
    cell: (info) => (
      <span className="font-mono tabular-nums">{formatNumber(info.getValue().length)}</span>
    ),
  }),
  columnHelper.display({
    id: "transfers",
    header: "Transfer Selesai",
    cell: (info) => {
      const row = info.row.original
      return (
        <span className="font-mono tabular-nums font-medium">
          {formatNumber(row.receivedTransferCount)} / {formatNumber(row.transferCount)}
        </span>
      )
    },
  }),
  columnHelper.accessor("status", {
    header: "Status",
    cell: (info) => (
      <StatusChip status={info.getValue()} customLabel={info.row.original.statusLabel} />
    ),
  }),
]

export function MaterialRequestWorkbenchTable({
  incoming,
  outgoing,
}: {
  incoming: MaterialRequestQueueRow[]
  outgoing: MaterialRequestQueueRow[]
}) {
  const [activeTab, setActiveTab] = useState<"all" | "incoming" | "outgoing">("all")

  const combinedData = useMemo<MaterialRequestWorkbenchItem[]>(() => {
    const inc = incoming.map((r) => ({ ...r, direction: "incoming" as const }))
    const out = outgoing.map((r) => ({ ...r, direction: "outgoing" as const }))
    return [...inc, ...out]
  }, [incoming, outgoing])

  const filteredData = useMemo(() => {
    if (activeTab === "incoming") {
      return combinedData.filter((r) => r.direction === "incoming")
    }
    if (activeTab === "outgoing") {
      return combinedData.filter((r) => r.direction === "outgoing")
    }
    return combinedData
  }, [combinedData, activeTab])

  const tabButtons = (
    <div className="flex items-center rounded-lg border border-border bg-muted/40 p-1 text-xs">
      <button
        type="button"
        onClick={() => setActiveTab("all")}
        className={`px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
          activeTab === "all"
            ? "bg-card text-foreground font-semibold shadow-2xs"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        Semua ({combinedData.length})
      </button>
      <button
        type="button"
        onClick={() => setActiveTab("incoming")}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
          activeTab === "incoming"
            ? "bg-card text-foreground font-semibold shadow-2xs"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <ArrowDown className="size-3 text-emerald-600 dark:text-emerald-400" />
        <span>Permintaan Masuk ({incoming.length})</span>
      </button>
      <button
        type="button"
        onClick={() => setActiveTab("outgoing")}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
          activeTab === "outgoing"
            ? "bg-card text-foreground font-semibold shadow-2xs"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <ArrowUp className="size-3 text-blue-600 dark:text-blue-400" />
        <span>Permintaan Keluar ({outgoing.length})</span>
      </button>
    </div>
  )

  return (
    <div className="rounded-xl border border-border bg-card shadow-2xs overflow-hidden p-4">
      <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Daftar Permintaan Material</h2>
          <p className="text-xs text-muted-foreground">
            Cari, pilah, dan pantau seluruh permintaan transfer internal antar gudang.
          </p>
        </div>
        {tabButtons}
      </div>

      <DataTable
        data={filteredData}
        columns={columns}
        searchColumn="documentNo"
        searchPlaceholder="Cari nomor dokumen..."
        pageSize={15}
        ariaLabel="Tabel Permintaan Antar Gudang"
      />
    </div>
  )
}
