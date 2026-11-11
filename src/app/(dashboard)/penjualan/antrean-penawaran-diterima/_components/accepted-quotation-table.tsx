"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { StatusChip } from "@/components/ui/status-chip"
import { formatCurrencyExact, formatDate } from "@/lib/utils/format"
import { entityHref } from "@/lib/utils/entity-url"
import type {
  AcceptedQuotationRow,
  AcceptedQuotationStage,
} from "@/lib/reports/quotation-accepted-queue"
import {
  ACCEPTED_QUOTATION_STAGE_LABELS,
} from "@/lib/reports/quotation-accepted-queue"
import {
  ArrowUpRight,
  Plus,
  Receipt,
} from "@/components/ui/fontawesome-icons"

export interface AcceptedQuotationTableRow extends AcceptedQuotationRow {
  id: number
}

interface AcceptedQuotationTableProps {
  rows: AcceptedQuotationRow[]
  canCreateSalesOrder: boolean
  canCreateDownPayment: boolean
}

const STAGE_TONES: Record<
  AcceptedQuotationStage,
  "danger" | "warning" | "accent" | "default"
> = {
  MASA_BERLAKU_LEWAT: "danger",
  MENGENDAP: "warning",
  MENUNGGU_TINDAK_LANJUT: "accent",
  PERNAH_DIKONVERSI_SO_BATAL: "default",
}

export function AcceptedQuotationTable({
  rows,
  canCreateSalesOrder,
  canCreateDownPayment,
}: AcceptedQuotationTableProps) {
  const [selectedTab, setSelectedTab] = useState<"all" | AcceptedQuotationStage>("all")

  const tableData: AcceptedQuotationTableRow[] = useMemo(() => {
    return rows.map((r) => ({
      ...r,
      id: r.quotationId,
    }))
  }, [rows])

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: rows.length,
      MENGENDAP: 0,
      MENUNGGU_TINDAK_LANJUT: 0,
      MASA_BERLAKU_LEWAT: 0,
      PERNAH_DIKONVERSI_SO_BATAL: 0,
    }
    for (const r of rows) {
      counts[r.tahap] = (counts[r.tahap] || 0) + 1
    }
    return counts
  }, [rows])

  const filteredData = useMemo(() => {
    if (selectedTab === "all") return tableData
    return tableData.filter((r) => r.tahap === selectedTab)
  }, [tableData, selectedTab])

  const columnHelper = createColumnHelper<AcceptedQuotationTableRow>()

  const columns = useMemo(() => [
    columnHelper.accessor("documentNo", {
      header: "No. Penawaran",
      cell: (info) => {
        const row = info.row.original
        const href = entityHref("/penjualan/penawaran", {
          id: row.quotationId,
          slug: row.slug,
        })
        return (
          <div className="flex flex-col gap-1">
            <Link
              href={href}
              className="font-mono text-xs font-semibold text-primary hover:underline hover:text-primary/80"
            >
              {info.getValue()}
            </Link>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] text-muted-foreground">
                {formatDate(row.date)}
              </span>
              {row.acceptedAt ? (
                <>
                  <span className="text-muted-foreground/40 text-[10px]">•</span>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                    Deal {formatDate(row.acceptedAt)}
                  </span>
                </>
              ) : null}
            </div>
          </div>
        )
      },
    }),
    columnHelper.accessor("customerName", {
      header: "Pelanggan",
      cell: (info) => {
        const row = info.row.original
        return (
          <div className="flex flex-col max-w-[220px] truncate">
            <span className="font-medium text-foreground text-xs truncate" title={info.getValue()}>
              {info.getValue()}
            </span>
            {row.contactPerson ? (
              <span className="text-[11px] text-muted-foreground truncate" title={row.contactPerson}>
                PIC: {row.contactPerson}
              </span>
            ) : row.salesEmployeeName ? (
              <span className="text-[11px] text-muted-foreground truncate" title={row.salesEmployeeName}>
                Sales: {row.salesEmployeeName}
              </span>
            ) : null}
          </div>
        )
      },
    }),
    columnHelper.accessor("umurTerimaHari", {
      header: "Waktu Tunggu",
      cell: (info) => {
        const row = info.row.original
        if (row.umurTerimaHari === null) {
          return <span className="text-xs text-muted-foreground/60 italic">tidak tercatat</span>
        }
        const isStale = row.tahap === "MENGENDAP"
        return (
          <span
            className={`inline-flex items-center font-mono text-xs font-semibold tabular-nums px-2 py-0.5 rounded ${
              isStale
                ? "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-900/50"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {row.umurTerimaHari} hari
          </span>
        )
      },
    }),
    columnHelper.accessor("validUntil", {
      header: "Masa Berlaku",
      cell: (info) => {
        const row = info.row.original
        if (!row.validUntil) {
          return <span className="text-xs text-muted-foreground/60">Tanpa batas</span>
        }
        const isExpired = row.sisaHari != null && row.sisaHari < 0
        return (
          <div className="flex flex-col">
            <span className="text-xs text-foreground whitespace-nowrap">
              {formatDate(row.validUntil)}
            </span>
            <span
              className={`text-[10px] font-mono tabular-nums ${
                isExpired
                  ? "text-red-600 dark:text-red-400 font-semibold"
                  : "text-muted-foreground"
              }`}
            >
              {isExpired
                ? `Lewat ${Math.abs(row.sisaHari!)} hari`
                : `Sisa ${row.sisaHari} hari`}
            </span>
          </div>
        )
      },
    }),
    columnHelper.accessor("grandTotal", {
      header: "Nilai Penawaran",
      cell: (info) => {
        const row = info.row.original
        const hasDp = row.dpConfirmedCount > 0 || row.dpPendingCount > 0
        return (
          <div className="flex flex-col text-right">
            <span className="font-mono text-xs font-semibold tabular-nums text-foreground">
              {formatCurrencyExact(info.getValue())}
            </span>
            {hasDp ? (
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                DP {formatCurrencyExact(row.dpConfirmedTotal + row.dpPendingTotal)}
              </span>
            ) : null}
          </div>
        )
      },
    }),
    columnHelper.accessor("tahap", {
      header: "Tahap Antrean",
      cell: (info) => {
        const tahap = info.getValue()
        return (
          <StatusChip
            status={tahap}
            customLabel={ACCEPTED_QUOTATION_STAGE_LABELS[tahap]}
            customTone={STAGE_TONES[tahap]}
          />
        )
      },
    }),
    columnHelper.display({
      id: "actions",
      header: "Aksi",
      cell: (info) => {
        const row = info.row.original
        const detailHref = entityHref("/penjualan/penawaran", {
          id: row.quotationId,
          slug: row.slug,
        })
        const showConvert = canCreateSalesOrder && !row.masaBerlakuLewat
        return (
          <div className="flex items-center gap-1.5 flex-nowrap">
            {showConvert ? (
              <Link
                href={`/penjualan/pesanan/tambah/penawaran/${row.slug ?? row.quotationId}`}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer shadow-2xs whitespace-nowrap"
                title="Konversi langsung ke Pesanan Penjualan"
              >
                <Plus className="size-3" aria-hidden="true" />
                <span>Buat Pesanan</span>
              </Link>
            ) : null}

            {canCreateDownPayment ? (
              <Link
                href={`/penjualan/uang-muka/tambah/penawaran/${row.slug ?? row.quotationId}`}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md border border-border bg-card hover:bg-muted text-foreground transition-colors cursor-pointer shadow-2xs whitespace-nowrap"
                title="Catat penerimaan Uang Muka"
              >
                <Receipt className="size-3 text-muted-foreground" aria-hidden="true" />
                <span>Uang Muka</span>
              </Link>
            ) : null}

            <Link
              href={detailHref}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer shadow-2xs whitespace-nowrap"
              title="Lihat detail penawaran"
            >
              <ArrowUpRight className="size-3" aria-hidden="true" />
            </Link>
          </div>
        )
      },
    }),
  ], [canCreateSalesOrder, canCreateDownPayment, columnHelper])

  return (
    <div className="flex flex-col gap-4">
      {/* Segmented Filter Bar Standar ERP */}
      <div className="flex items-center gap-1 p-1 bg-muted/60 rounded-lg border border-border/80 w-fit flex-wrap">
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
          onClick={() => setSelectedTab("MENUNGGU_TINDAK_LANJUT")}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
            selectedTab === "MENUNGGU_TINDAK_LANJUT"
              ? "bg-card text-blue-600 dark:text-blue-400 shadow-xs font-semibold"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <span className="size-1.5 rounded-full bg-blue-500" />
          <span>Menunggu Tindak Lanjut ({stageCounts.MENUNGGU_TINDAK_LANJUT || 0})</span>
        </button>
        <button
          type="button"
          onClick={() => setSelectedTab("MENGENDAP")}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
            selectedTab === "MENGENDAP"
              ? "bg-card text-amber-600 dark:text-amber-400 shadow-xs font-semibold"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <span className="size-1.5 rounded-full bg-amber-500" />
          <span>Mengendap ({stageCounts.MENGENDAP || 0})</span>
        </button>
        <button
          type="button"
          onClick={() => setSelectedTab("MASA_BERLAKU_LEWAT")}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
            selectedTab === "MASA_BERLAKU_LEWAT"
              ? "bg-card text-red-600 dark:text-red-400 shadow-xs font-semibold"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <span className="size-1.5 rounded-full bg-red-500" />
          <span>Masa Berlaku Lewat ({stageCounts.MASA_BERLAKU_LEWAT || 0})</span>
        </button>
        {stageCounts.PERNAH_DIKONVERSI_SO_BATAL ? (
          <button
            type="button"
            onClick={() => setSelectedTab("PERNAH_DIKONVERSI_SO_BATAL")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
              selectedTab === "PERNAH_DIKONVERSI_SO_BATAL"
                ? "bg-card text-muted-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className="size-1.5 rounded-full bg-zinc-400" />
            <span>SO Dibatalkan ({stageCounts.PERNAH_DIKONVERSI_SO_BATAL})</span>
          </button>
        ) : null}
      </div>

      <div className="rounded-lg border border-border bg-card shadow-2xs overflow-hidden">
        <DataTable
          columns={columns}
          data={filteredData}
          searchColumn="documentNo"
          searchPlaceholder="Cari nomor penawaran..."
        />
      </div>
    </div>
  )
}
