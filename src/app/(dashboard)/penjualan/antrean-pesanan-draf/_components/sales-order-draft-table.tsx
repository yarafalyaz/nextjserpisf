"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { StatusChip } from "@/components/ui/status-chip"
import { formatCurrencyExact, formatDate } from "@/lib/utils/format"
import { entityHref } from "@/lib/utils/entity-url"
import type {
  SalesOrderDraftRow,
  SalesOrderDraftLevel,
} from "@/lib/reports/sales-order-draft-queue"
import {
  SALES_ORDER_DRAFT_AGE_COLUMN_TEXT,
  SALES_ORDER_DRAFT_DELIVERY_COLUMN_TEXT,
  SALES_ORDER_DRAFT_LEVEL_LABELS,
  SALES_ORDER_DRAFT_NO_DELIVERY_DATE_TEXT,
} from "@/lib/reports/sales-order-draft-queue"
import { ArrowUpRight } from "@/components/ui/fontawesome-icons"

export interface SalesOrderDraftTableRow extends SalesOrderDraftRow {
  id: number
}

interface SalesOrderDraftTableProps {
  rows: SalesOrderDraftRow[]
  levelCounts: Record<SalesOrderDraftLevel, number>
}

const columnHelper = createColumnHelper<SalesOrderDraftTableRow>()

const columns = [
  columnHelper.accessor("customerName", {
    header: "Pelanggan",
    cell: (info) => (
      <span className="font-medium text-foreground">{info.getValue()}</span>
    ),
  }),
  columnHelper.accessor("documentNo", {
    header: "No. Pesanan",
    cell: (info) => {
      const row = info.row.original
      const href = entityHref("/penjualan/pesanan", {
        id: row.salesOrderId,
        slug: row.slug,
      })
      return (
        <Link
          href={href}
          className="font-mono text-xs font-semibold text-primary hover:underline hover:text-primary/80"
        >
          {info.getValue()}
        </Link>
      )
    },
  }),
  columnHelper.accessor("salesEmployeeName", {
    header: "Penjual",
    cell: (info) => info.getValue() ?? <span className="text-muted-foreground">—</span>,
  }),
  columnHelper.accessor("date", {
    header: "Tanggal",
    cell: (info) => (
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        {formatDate(info.getValue())}
      </span>
    ),
  }),
  columnHelper.accessor("umurDraftHari", {
    header: SALES_ORDER_DRAFT_AGE_COLUMN_TEXT,
    cell: (info) => {
      const days = info.getValue()
      const isMengendap = info.row.original.tingkat === "mengendap"
      return (
        <span
          className={`font-mono text-xs font-semibold tabular-nums px-2 py-0.5 rounded ${
            isMengendap
              ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 border border-red-200 dark:border-red-900/50"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {days} hari
        </span>
      )
    },
  }),
  columnHelper.accessor("deliveryDate", {
    header: SALES_ORDER_DRAFT_DELIVERY_COLUMN_TEXT,
    cell: (info) => {
      const val = info.getValue()
      return (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {val ? formatDate(val) : SALES_ORDER_DRAFT_NO_DELIVERY_DATE_TEXT}
        </span>
      )
    },
  }),
  columnHelper.accessor("asalLabel", {
    header: "Asal",
    cell: (info) => (
      <span className="text-xs text-muted-foreground">{info.getValue()}</span>
    ),
  }),
  columnHelper.accessor("grandTotal", {
    header: "Nilai",
    cell: (info) => (
      <span className="font-mono text-xs font-medium tabular-nums text-foreground block text-right">
        {formatCurrencyExact(info.getValue())}
      </span>
    ),
  }),
  columnHelper.accessor("tingkat", {
    header: "Tingkat",
    cell: (info) => {
      const tingkat = info.getValue()
      return (
        <StatusChip
          status={tingkat}
          customLabel={SALES_ORDER_DRAFT_LEVEL_LABELS[tingkat]}
          customTone={tingkat === "mengendap" ? "danger" : "default"}
        />
      )
    },
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    cell: (info) => {
      const row = info.row.original
      const href = entityHref("/penjualan/pesanan", {
        id: row.salesOrderId,
        slug: row.slug,
      })
      return (
        <Link
          href={href}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border border-border bg-card hover:bg-muted text-foreground transition-colors cursor-pointer shadow-2xs"
        >
          <span>Buka Pesanan</span>
          <ArrowUpRight className="size-3 text-muted-foreground" aria-hidden="true" />
        </Link>
      )
    },
  }),
]

export function SalesOrderDraftTable({
  rows,
  levelCounts,
}: SalesOrderDraftTableProps) {
  const [selectedTab, setSelectedTab] = useState<"all" | SalesOrderDraftLevel>("all")

  const tableData: SalesOrderDraftTableRow[] = useMemo(() => {
    return rows.map((r) => ({
      ...r,
      id: r.salesOrderId,
    }))
  }, [rows])

  const filteredData = useMemo(() => {
    if (selectedTab === "all") return tableData
    return tableData.filter((r) => r.tingkat === selectedTab)
  }, [tableData, selectedTab])

  return (
    <div className="flex flex-col gap-4">
      {/* Segmented Filter Bar Standar ERP */}
      <div className="flex items-center gap-1 p-1 bg-muted/60 rounded-lg border border-border/80 w-fit">
        <button
          type="button"
          onClick={() => setSelectedTab("all")}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
            selectedTab === "all"
              ? "bg-card text-foreground shadow-xs font-semibold"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Semua ({tableData.length})
        </button>
        <button
          type="button"
          onClick={() => setSelectedTab("mengendap")}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
            selectedTab === "mengendap"
              ? "bg-card text-red-600 dark:text-red-400 shadow-xs font-semibold"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <span className="size-1.5 rounded-full bg-red-500" />
          <span>Mengendap ({levelCounts.mengendap})</span>
        </button>
        <button
          type="button"
          onClick={() => setSelectedTab("menunggu")}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
            selectedTab === "menunggu"
              ? "bg-card text-amber-600 dark:text-amber-400 shadow-xs font-semibold"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <span className="size-1.5 rounded-full bg-amber-500" />
          <span>Menunggu Persetujuan ({levelCounts.menunggu})</span>
        </button>
      </div>

      <div className="rounded-lg border border-border bg-card shadow-2xs overflow-hidden">
        <DataTable
          columns={columns}
          data={filteredData}
          searchColumn="documentNo"
          searchPlaceholder="Cari nomor pesanan..."
        />
      </div>
    </div>
  )
}
