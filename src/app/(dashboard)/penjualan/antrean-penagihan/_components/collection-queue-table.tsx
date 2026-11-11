"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { StatusChip } from "@/components/ui/status-chip"
import { formatCurrencyExact, formatDate } from "@/lib/utils/format"
import { entityHref } from "@/lib/utils/entity-url"
import type {
  CollectionQueueRow,
  CollectionReminderLevel,
  CollectionStage,
  CollectionQueueSummary,
} from "@/lib/reports/collection-queue"
import {
  COLLECTION_REMINDER_LEVEL_LABELS,
} from "@/lib/reports/collection-queue"
import { buildWhatsappUrl } from "@/lib/utils/whatsapp"
import { recordWhatsappLinkOpened } from "@/actions/whatsapp-log.actions"
import { CollectionFollowUpForm } from "@/components/reports/collection-followup-form"
import { ArrowUpRight, Whatsapp } from "@/components/ui/fontawesome-icons"

export interface CollectionQueueTableRow extends CollectionQueueRow {
  id: number
}

interface CollectionQueueTableProps {
  rows: CollectionQueueRow[]
  summary: CollectionQueueSummary
  canCreateExchange: boolean
  canFollowUp: boolean
}

const STAGE_TONES: Record<
  CollectionStage,
  "danger" | "warning" | "accent" | "default"
> = {
  lewat_janji: "danger",
  belum_diserahkan: "warning",
  sudah_diserahkan: "accent",
}

const REMINDER_TONES: Record<
  CollectionReminderLevel,
  "danger" | "warning" | "accent" | "success" | "default"
> = {
  tanpa_acuan: "default",
  belum_perlu: "success",
  pengingat_awal: "warning",
  pengingat_lanjutan: "danger",
  eskalasi: "danger",
}

export function CollectionQueueTable({
  rows,
  summary,
  canCreateExchange,
  canFollowUp,
}: CollectionQueueTableProps) {
  const [selectedTab, setSelectedTab] = useState<"all" | CollectionReminderLevel>("all")

  const tableData: CollectionQueueTableRow[] = useMemo(() => {
    return rows.map((r) => ({
      ...r,
      id: r.invoiceId,
    }))
  }, [rows])

  const filteredData = useMemo(() => {
    if (selectedTab === "all") return tableData
    return tableData.filter((r) => r.tingkatPengingat === selectedTab)
  }, [tableData, selectedTab])

  const columnHelper = createColumnHelper<CollectionQueueTableRow>()

  const columns = useMemo(() => [
    columnHelper.accessor("documentNo", {
      header: "No. Faktur",
      cell: (info) => {
        const row = info.row.original
        const href = entityHref("/penjualan/faktur", {
          id: row.invoiceId,
        })
        return (
          <div className="flex flex-col gap-0.5">
            <Link
              href={href}
              className="font-mono text-xs font-semibold text-primary hover:underline hover:text-primary/80"
            >
              {info.getValue()}
            </Link>
            <div className="flex items-center gap-1.5 flex-wrap">
              {row.exchangeDocumentNo ? (
                <span
                  className="inline-flex items-center text-[10px] font-mono px-1 rounded bg-muted/80 text-muted-foreground border border-border/60"
                  title={`Tukar Faktur ${row.exchangeDocumentNo}`}
                >
                  TF: {row.exchangeDocumentNo}
                </span>
              ) : null}
              {row.hasOutstandingLateFee ? (
                <span className="text-[10px] font-medium text-destructive">
                  Denda: {formatCurrencyExact(row.lateFeeOutstanding)}
                </span>
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
          <div className="flex flex-col max-w-[180px] truncate">
            <span className="font-medium text-foreground text-xs truncate" title={info.getValue()}>
              {info.getValue()}
            </span>
            {row.contactPerson ? (
              <span className="text-[11px] text-muted-foreground truncate" title={row.contactPerson}>
                PIC: {row.contactPerson}
              </span>
            ) : null}
          </div>
        )
      },
    }),
    columnHelper.accessor("tingkatPengingat", {
      header: "Status Penagihan",
      cell: (info) => {
        const row = info.row.original
        return (
          <div className="flex flex-col gap-1 items-start">
            <StatusChip
              status={row.tingkatPengingat}
              customLabel={row.tingkatPengingatLabel}
              customTone={REMINDER_TONES[row.tingkatPengingat]}
            />
            <span className="text-[10px] text-muted-foreground">
              {row.tahapLabel}
            </span>
          </div>
        )
      },
    }),
    columnHelper.accessor("dueAcuan", {
      header: "Jatuh Tempo",
      cell: (info) => {
        const row = info.row.original
        return row.dueAcuan ? (
          <div className="flex flex-col">
            <span className="text-xs text-foreground whitespace-nowrap">
              {formatDate(row.dueAcuan)}
            </span>
            {row.umurHari !== null ? (
              <span
                className={`text-[10px] font-mono tabular-nums ${
                  row.umurHari > 0 ? "text-red-600 dark:text-red-400 font-medium" : "text-muted-foreground"
                }`}
              >
                {row.umurHari > 0 ? `Lewat ${row.umurHari} hari` : `${Math.abs(row.umurHari)} hari lagi`}
              </span>
            ) : null}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground/50 select-none">-</span>
        )
      },
    }),
    columnHelper.accessor("sisa", {
      header: "Sisa Tagihan",
      cell: (info) => {
        const row = info.row.original
        return (
          <div className="flex flex-col text-right">
            <span className="font-mono text-xs font-semibold tabular-nums text-foreground">
              {formatCurrencyExact(info.getValue())}
            </span>
            <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
              Total {formatCurrencyExact(row.grandTotal)}
            </span>
          </div>
        )
      },
    }),
    columnHelper.accessor("lastFollowUpAt", {
      header: "Tindak Lanjut",
      cell: (info) => {
        const row = info.row.original
        return (
          <div className="flex flex-col text-xs max-w-[120px]">
            {row.promiseDate ? (
              <span className="text-amber-600 dark:text-amber-400 font-medium text-[11px] whitespace-nowrap">
                Janji: {formatDate(row.promiseDate)}
              </span>
            ) : null}
            {row.lastFollowUpAt ? (
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                Follow-up: {formatDate(row.lastFollowUpAt)}
              </span>
            ) : !row.promiseDate ? (
              <span className="text-muted-foreground/50 select-none">-</span>
            ) : null}
          </div>
        )
      },
    }),
    columnHelper.display({
      id: "actions",
      header: "Aksi",
      cell: (info) => {
        const row = info.row.original
        const detailHref = entityHref("/penjualan/faktur", { id: row.invoiceId })
        const waMessage = `Halo ${row.customerName}, kami mengingatkan Faktur ${row.documentNo} dengan sisa ${formatCurrencyExact(row.sisa)}. Terima kasih.`
        const waHref = buildWhatsappUrl(row.customerPhone, waMessage)

        return (
          <div className="flex items-center gap-1.5 flex-nowrap">
            {canFollowUp ? (
              <CollectionFollowUpForm
                salesInvoiceId={row.invoiceId}
                documentNo={row.documentNo}
                customerName={row.customerName}
                defaultPromisedAmount={row.sisa}
              />
            ) : null}

            {canCreateExchange && row.tahap === "belum_diserahkan" ? (
              <Link
                href={`/penjualan/tukar-faktur/tambah/pelanggan/${row.customerId}/faktur/${row.invoiceId}`}
                className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-md border border-border bg-card hover:bg-muted text-foreground transition-colors cursor-pointer shadow-2xs whitespace-nowrap"
                title="Buat Dokumen Tukar Faktur"
              >
                <span>Tukar Faktur</span>
              </Link>
            ) : null}

            {waHref ? (
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Hubungi via WhatsApp"
                title="Kirim Pesan WhatsApp"
                className="inline-flex items-center justify-center size-7 rounded-md border border-border bg-card hover:bg-muted text-emerald-600 dark:text-emerald-400 transition-colors cursor-pointer shadow-2xs"
                onClick={() => {
                  void recordWhatsappLinkOpened({
                    modelType: "SalesInvoice",
                    modelId: row.invoiceId,
                    surface: "queue",
                  })
                }}
              >
                <Whatsapp className="size-3.5" aria-hidden="true" />
              </a>
            ) : null}

            <Link
              href={detailHref}
              className="inline-flex items-center justify-center size-7 rounded-md border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer shadow-2xs"
              title="Lihat Detail Faktur"
            >
              <ArrowUpRight className="size-3.5" aria-hidden="true" />
            </Link>
          </div>
        )
      },
    }),
  ], [canCreateExchange, canFollowUp, columnHelper])

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
          Semua ({summary.total})
        </button>
        <button
          type="button"
          onClick={() => setSelectedTab("eskalasi")}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
            selectedTab === "eskalasi"
              ? "bg-card text-red-600 dark:text-red-400 shadow-xs font-semibold"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <span className="size-1.5 rounded-full bg-red-600" />
          <span>Eskalasi ({summary.reminderLevels.eskalasi.count})</span>
        </button>
        <button
          type="button"
          onClick={() => setSelectedTab("pengingat_lanjutan")}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
            selectedTab === "pengingat_lanjutan"
              ? "bg-card text-red-500 dark:text-red-400 shadow-xs font-semibold"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <span className="size-1.5 rounded-full bg-red-400" />
          <span>Pengingat Lanjutan ({summary.reminderLevels.pengingat_lanjutan.count})</span>
        </button>
        <button
          type="button"
          onClick={() => setSelectedTab("pengingat_awal")}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
            selectedTab === "pengingat_awal"
              ? "bg-card text-amber-600 dark:text-amber-400 shadow-xs font-semibold"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <span className="size-1.5 rounded-full bg-amber-500" />
          <span>Pengingat Awal ({summary.reminderLevels.pengingat_awal.count})</span>
        </button>
        <button
          type="button"
          onClick={() => setSelectedTab("belum_perlu")}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
            selectedTab === "belum_perlu"
              ? "bg-card text-emerald-600 dark:text-emerald-400 shadow-xs font-semibold"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <span className="size-1.5 rounded-full bg-emerald-500" />
          <span>Belum Perlu ({summary.reminderLevels.belum_perlu.count})</span>
        </button>
        {summary.reminderLevels.tanpa_acuan.count > 0 ? (
          <button
            type="button"
            onClick={() => setSelectedTab("tanpa_acuan")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
              selectedTab === "tanpa_acuan"
                ? "bg-card text-muted-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className="size-1.5 rounded-full bg-zinc-400" />
            <span>Tanpa Acuan ({summary.reminderLevels.tanpa_acuan.count})</span>
          </button>
        ) : null}
      </div>

      <div className="rounded-lg border border-border bg-card shadow-2xs overflow-hidden">
        <DataTable
          columns={columns}
          data={filteredData}
          searchColumn="documentNo"
          selectable={false}
          searchPlaceholder="Cari nomor faktur..."
        />
      </div>
    </div>
  )
}
