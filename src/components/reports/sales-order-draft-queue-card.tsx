"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  SALES_ORDER_DRAFT_AGE_COLUMN_TEXT,
  SALES_ORDER_DRAFT_DELIVERY_COLUMN_TEXT,
  SALES_ORDER_DRAFT_LEVEL_LABELS,
  SALES_ORDER_DRAFT_LEVELS,
  SALES_ORDER_DRAFT_NO_DELIVERY_DATE_TEXT,
  SALES_ORDER_DRAFT_NOTICE_TEXT,
  SALES_ORDER_DRAFT_QUEUE_TITLE_TEXT,
  SALES_ORDER_DRAFT_TOTAL_LABEL_TEXT,
  type SalesOrderDraftLevel,
  type SalesOrderDraftRow,
} from "@/lib/reports/sales-order-draft-queue"
import { entityHref } from "@/lib/utils/entity-url"
import { formatCurrencyExact, formatDate } from "@/lib/utils/format"
import { StatusChip } from "@/components/ui/status-chip"
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
} from "@/components/ui/detail-table"
import { BoxArchive, Search } from "@/components/ui/fontawesome-icons"

const LEVEL_TONES: Record<SalesOrderDraftLevel, "danger" | "default"> = {
  mengendap: "danger",
  menunggu: "default",
}

/**
 * F-2026-10-26-056-S (056-F): antrean pesanan penjualan draft mengendap.
 *
 * Data loader read-only `getSalesOrderDraftQueue` — tingkat, label tingkat,
 * umur draft, penanda janji, asal, dan rekap ditampilkan apa adanya; UI
 * tidak menghitung ulang dan tidak mengurut ulang (Q-SOQ-3/4). Judul,
 * notice, label kolom, dan label rekap verbatim konstanta builder.
 * Penjual null tampil `—`; tanpa janji tampil penanda builder. Tanpa
 * tombol Setujui/Batal/Kirim di antrean: tindak-lanjut lewat detail
 * pesanan existing.
 */
export function SalesOrderDraftQueueCard({
  rows,
  levelCounts,
  totalDocuments,
  totalGrandTotal,
}: Readonly<{
  rows: SalesOrderDraftRow[]
  levelCounts: Record<SalesOrderDraftLevel, number>
  totalDocuments: number
  totalGrandTotal: number
}>) {
  const title = SALES_ORDER_DRAFT_QUEUE_TITLE_TEXT
  const [filterLevel, setFilterLevel] = useState<"all" | SalesOrderDraftLevel>("all")
  const [searchQuery, setSearchQuery] = useState("")

  const filteredRows = useMemo(() => {
    let result = rows
    if (filterLevel !== "all") {
      result = result.filter((r) => r.tingkat === filterLevel)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (r) =>
          r.documentNo.toLowerCase().includes(q) ||
          r.customerName.toLowerCase().includes(q) ||
          (r.salesEmployeeName && r.salesEmployeeName.toLowerCase().includes(q)),
      )
    }
    return result
  }, [rows, filterLevel, searchQuery])

  return (
    <section
      aria-label={title}
      className="bg-card rounded-lg border border-border shadow-2xs overflow-hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-border bg-muted/20">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <div className="flex items-center gap-2">
          <p className="text-xs font-mono tabular-nums text-muted-foreground">
            {totalDocuments} dokumen — {formatCurrencyExact(totalGrandTotal)}{" "}
            {SALES_ORDER_DRAFT_TOTAL_LABEL_TEXT}
          </p>
        </div>
      </div>
      <div className="p-4 px-5">
        {/* Toolbar Interaktif Standar ERP: Filter Segmented Tabs & Input Pencarian */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-border/60">
          <ul
            aria-label="Rekap tingkat antrean pesanan draft"
            role="tablist"
            className="flex flex-wrap items-center rounded-lg border border-border bg-muted/40 p-1 text-xs gap-1"
          >
            <li role="presentation">
              <span
                role="tab"
                tabIndex={0}
                aria-selected={filterLevel === "all"}
                onClick={() => setFilterLevel("all")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    setFilterLevel("all")
                  }
                }}
                className={`inline-flex items-center px-3 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors ${
                  filterLevel === "all"
                    ? "bg-card text-foreground font-semibold shadow-2xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Semua Draft ({totalDocuments})
              </span>
            </li>
            {SALES_ORDER_DRAFT_LEVELS.map((level) => {
              const count = levelCounts[level]
              const isSelected = filterLevel === level
              return (
                <li
                  key={level}
                  role="presentation"
                  onClick={() => setFilterLevel(level)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      setFilterLevel(level)
                    }
                  }}
                  className={`cursor-pointer rounded-full transition-all ${
                    isSelected ? "ring-2 ring-primary ring-offset-1" : "opacity-85 hover:opacity-100"
                  }`}
                >
                  <StatusChip
                    status={level}
                    customLabel={`${SALES_ORDER_DRAFT_LEVEL_LABELS[level]}: ${count}`}
                    customTone={LEVEL_TONES[level]}
                  />
                </li>
              )
            })}
          </ul>

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" aria-hidden="true" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari pelanggan, no. SO, sales..."
              className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-3 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        </div>

        <div className="mt-3 rounded-md border border-border/70 bg-muted/30 px-3 py-2">
          <p className="text-xs text-muted-foreground leading-relaxed text-pretty">
            {SALES_ORDER_DRAFT_NOTICE_TEXT}
          </p>
        </div>

        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground">
            <div className="flex size-9 items-center justify-center rounded-full bg-muted/60 text-muted-foreground">
              <BoxArchive className="size-4" aria-hidden="true" />
            </div>
            <p className="text-xs font-medium text-muted-foreground">
              Belum ada pesanan penjualan draft
            </p>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground">
            <div className="flex size-9 items-center justify-center rounded-full bg-muted/60 text-muted-foreground">
              <BoxArchive className="size-4" aria-hidden="true" />
            </div>
            <p className="text-xs font-medium text-muted-foreground">
              Tidak ada pesanan draft yang cocok dengan filter pencarian
            </p>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>Pelanggan</DetailTableTh>
                <DetailTableTh>No. Pesanan</DetailTableTh>
                <DetailTableTh>Penjual</DetailTableTh>
                <DetailTableTh>Tanggal</DetailTableTh>
                <DetailTableTh>{SALES_ORDER_DRAFT_AGE_COLUMN_TEXT}</DetailTableTh>
                <DetailTableTh>{SALES_ORDER_DRAFT_DELIVERY_COLUMN_TEXT}</DetailTableTh>
                <DetailTableTh>Asal</DetailTableTh>
                <DetailTableTh align="right">Nilai</DetailTableTh>
                <DetailTableTh>Tingkat</DetailTableTh>
                <DetailTableTh>Aksi</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {filteredRows.map((row) => (
                  <DetailTableRow key={row.salesOrderId}>
                    <DetailTableTd className="font-medium text-foreground">{row.customerName}</DetailTableTd>
                    <DetailTableTd>
                      <Link
                        href={entityHref("/penjualan/pesanan", {
                          id: row.salesOrderId,
                          slug: row.slug,
                        })}
                        className="font-mono text-xs font-medium text-primary hover:underline tabular-nums"
                      >
                        {row.documentNo}
                      </Link>
                    </DetailTableTd>
                    <DetailTableTd>{row.salesEmployeeName ?? "—"}</DetailTableTd>
                    <DetailTableTd className="font-mono text-xs tabular-nums text-muted-foreground">
                      {formatDate(row.date)}
                    </DetailTableTd>
                    <DetailTableTd className="font-mono text-xs tabular-nums">
                      {`${row.umurDraftHari} hari`}
                    </DetailTableTd>
                    <DetailTableTd className="text-xs">
                      {row.punyaJanji && row.deliveryDate
                        ? formatDate(row.deliveryDate)
                        : SALES_ORDER_DRAFT_NO_DELIVERY_DATE_TEXT}
                    </DetailTableTd>
                    <DetailTableTd>{row.asalLabel}</DetailTableTd>
                    <DetailTableTd align="right" className="font-mono font-semibold tabular-nums text-foreground">
                      {formatCurrencyExact(row.grandTotal)}
                    </DetailTableTd>
                    <DetailTableTd>
                      <StatusChip
                        status={row.tingkat}
                        customLabel={row.tingkatLabel}
                        customTone={LEVEL_TONES[row.tingkat]}
                      />
                    </DetailTableTd>
                    <DetailTableTd>
                      <Link
                        href={entityHref("/penjualan/pesanan", {
                          id: row.salesOrderId,
                          slug: row.slug,
                        })}
                        className="inline-flex min-h-11 items-center text-xs font-medium text-primary hover:underline"
                      >
                        Buka Pesanan
                      </Link>
                    </DetailTableTd>
                  </DetailTableRow>
                ))}
              </DetailTableBody>
            </DetailTable>
          </div>
        )}
      </div>
    </section>
  )
}
