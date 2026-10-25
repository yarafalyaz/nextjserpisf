"use client"

import { useState } from "react"
import Link from "next/link"

import type {
  CollectionQueueRow,
  CollectionQueueSummary,
  CollectionReminderLevel,
  CollectionStage,
} from "@/lib/reports/collection-queue"
import {
  COLLECTION_QUEUE_NOTICE_TEXT,
  COLLECTION_QUEUE_TITLE,
  COLLECTION_REMINDER_LEVELS,
  COLLECTION_REMINDER_LEVEL_LABELS,
  COLLECTION_REMINDER_LEVEL_TITLE,
  COLLECTION_REMINDER_NOTICE_TEXT,
} from "@/lib/reports/collection-queue"
import { entityHref } from "@/lib/utils/entity-url"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import { StatusChip } from "@/components/ui/status-chip"
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
} from "@/components/ui/detail-table"
import { WhatsappButton } from "./whatsapp-button"
import { CollectionFollowUpForm } from "./collection-followup-form"

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

/**
 * Antrean Penagihan Piutang (F-2026-10-22-089-S §6).
 *
 * Data dari loader `getCollectionQueue` — tahap, sisa, umur ditampilkan
 * apa adanya; UI tidak menghitung ulang (AC-COL-10). Kata kolom/tombol/
 * notice verbatim §6 dari konstanta builder. Klik WhatsApp hanya membuka
 * tautan (WhatsappButton existing) — bukan tindak lanjut (BR-COL-08).
 * Kontak hanya di antrean berizin; tanpa ekspor (Q-COL-4).
 *
 * F-2026-10-26-050-S: kolom Tingkat Pengingat + filter tampil per tingkat
 * (Q-COLR-4) — tingkat/label/rekap dari builder apa adanya, UI tidak
 * menurunkan tingkat dari umur/janji (AC-COLR-10). Filter hanya menyaring
 * baris tampil; urutan server dan rekap populasi penuh tidak berubah.
 */
export function CollectionQueueCard({
  rows,
  summary,
  canCreateExchange,
  canFollowUp,
}: Readonly<{
  rows: CollectionQueueRow[]
  summary: CollectionQueueSummary
  canCreateExchange: boolean
  canFollowUp: boolean
}>) {
  const [levelFilter, setLevelFilter] = useState<
    CollectionReminderLevel | "semua"
  >("semua")
  const visibleRows =
    levelFilter === "semua"
      ? rows
      : rows.filter((row) => row.tingkatPengingat === levelFilter)

  return (
    <section
      aria-label={COLLECTION_QUEUE_TITLE}
      className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 px-5 border-b border-default">
        <h2 className="text-[0.9375rem] font-semibold text-foreground">
          {COLLECTION_QUEUE_TITLE}
        </h2>
        <p className="text-xs text-muted-foreground">
          {summary.total} faktur · Sisa {formatCurrency(summary.totalSisa)} ·
          Belum Diserahkan {summary.belumDiserahkan} · Sudah Diserahkan{" "}
          {summary.sudahDiserahkan} · Lewat Janji {summary.lewatJanji}
        </p>
      </div>
      <div className="p-4 px-5">
        <p className="text-xs text-muted-foreground">
          {COLLECTION_QUEUE_NOTICE_TEXT}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {COLLECTION_REMINDER_NOTICE_TEXT}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {COLLECTION_REMINDER_LEVELS.map(
            (level) =>
              `${COLLECTION_REMINDER_LEVEL_LABELS[level]} ${summary.reminderLevels[level].count} · ${formatCurrency(summary.reminderLevels[level].totalSisa)}`,
          ).join(" · ")}
        </p>
        {rows.length === 0 ? (
          <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            Belum ada faktur yang perlu ditagih
          </p>
        ) : (
          <>
            <div
              className="mt-3 flex flex-wrap gap-1.5"
              role="group"
              aria-label="Filter tingkat pengingat"
            >
              <button
                type="button"
                className={`filter-chip ${levelFilter === "semua" ? "active" : ""}`}
                aria-pressed={levelFilter === "semua"}
                onClick={() => setLevelFilter("semua")}
              >
                Semua ({summary.total})
              </button>
              {COLLECTION_REMINDER_LEVELS.map((level) => (
                <button
                  key={level}
                  type="button"
                  className={`filter-chip ${levelFilter === level ? "active" : ""}`}
                  aria-pressed={levelFilter === level}
                  onClick={() => setLevelFilter(level)}
                >
                  {COLLECTION_REMINDER_LEVEL_LABELS[level]} (
                  {summary.reminderLevels[level].count})
                </button>
              ))}
            </div>
            {visibleRows.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">
                Tidak ada faktur pada tingkat pengingat ini.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <DetailTable>
                  <DetailTableHead>
                    <DetailTableTh>Pelanggan</DetailTableTh>
                    <DetailTableTh>No. Faktur</DetailTableTh>
                    <DetailTableTh>Tahap</DetailTableTh>
                    <DetailTableTh>{COLLECTION_REMINDER_LEVEL_TITLE}</DetailTableTh>
                    <DetailTableTh>Jatuh Tempo Acuan</DetailTableTh>
                    <DetailTableTh align="right">Umur</DetailTableTh>
                    <DetailTableTh align="right">Nilai Faktur</DetailTableTh>
                    <DetailTableTh align="right">Dibayar</DetailTableTh>
                    <DetailTableTh align="right">Sisa</DetailTableTh>
                    <DetailTableTh>Tindak Lanjut Terakhir</DetailTableTh>
                    <DetailTableTh>Janji Bayar</DetailTableTh>
                    <DetailTableTh>Aksi</DetailTableTh>
                  </DetailTableHead>
                  <DetailTableBody>
                    {visibleRows.map((row) => (
                      <DetailTableRow key={row.invoiceId}>
                        <DetailTableTd>
                          {row.customerName}
                          {row.contactPerson ? (
                            <span className="block text-xs text-muted-foreground">
                              {row.contactPerson}
                            </span>
                          ) : null}
                        </DetailTableTd>
                        <DetailTableTd>
                          <Link
                            href={entityHref("/penjualan/faktur", {
                              id: row.invoiceId,
                            })}
                            className="font-medium text-primary hover:underline"
                          >
                            {row.documentNo}
                          </Link>
                          {row.exchangeDocumentNo ? (
                            <span className="block text-xs text-muted-foreground">
                              Tukar Faktur {row.exchangeDocumentNo}
                            </span>
                          ) : null}
                          {row.hasOutstandingLateFee ? (
                            <span className="block text-xs font-medium text-destructive">
                              Ada denda terutang {formatCurrency(row.lateFeeOutstanding)}
                            </span>
                          ) : null}
                        </DetailTableTd>
                        <DetailTableTd>
                          <StatusChip
                            status={row.tahap}
                            customLabel={row.tahapLabel}
                            customTone={STAGE_TONES[row.tahap]}
                          />
                        </DetailTableTd>
                        <DetailTableTd>
                          <StatusChip
                            status={row.tingkatPengingat}
                            customLabel={row.tingkatPengingatLabel}
                            customTone={REMINDER_TONES[row.tingkatPengingat]}
                          />
                        </DetailTableTd>
                        <DetailTableTd>
                          {row.dueAcuan ? formatDate(row.dueAcuan) : "—"}
                        </DetailTableTd>
                        <DetailTableTd align="right">
                          {row.umurHari === null ? "—" : `${row.umurHari} hari`}
                        </DetailTableTd>
                        <DetailTableTd align="right">
                          {formatCurrency(row.grandTotal)}
                        </DetailTableTd>
                        <DetailTableTd align="right">
                          {formatCurrency(row.paidAmount)}
                        </DetailTableTd>
                        <DetailTableTd align="right">
                          {formatCurrency(row.sisa)}
                        </DetailTableTd>
                        <DetailTableTd>
                          {row.lastFollowUpAt ? formatDate(row.lastFollowUpAt) : "—"}
                        </DetailTableTd>
                        <DetailTableTd>
                          {row.promiseDate ? formatDate(row.promiseDate) : "—"}
                        </DetailTableTd>
                        <DetailTableTd>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {canCreateExchange &&
                            row.tahap === "belum_diserahkan" ? (
                              <Link
                                href="/penjualan/tukar-faktur/tambah"
                                className="inline-flex min-h-11 items-center font-medium text-primary hover:underline sm:min-h-9"
                              >
                                Buat Tukar Faktur
                              </Link>
                            ) : null}
                            {canFollowUp ? (
                              <CollectionFollowUpForm
                                salesInvoiceId={row.invoiceId}
                                documentNo={row.documentNo}
                              />
                            ) : null}
                            {row.customerPhone ? (
                              <span className="[&>a]:min-h-11 sm:[&>a]:min-h-9">
                                <WhatsappButton
                                  phone={row.customerPhone}
                                  modelType="SalesInvoice"
                                  modelId={row.invoiceId}
                                  surface="queue"
                                  label="Hubungi via WhatsApp"
                                  message={`Halo ${row.customerName}, kami mengingatkan Faktur ${row.documentNo} dengan sisa ${formatCurrency(row.sisa)}. Terima kasih.`}
                                />
                              </span>
                            ) : null}
                          </div>
                        </DetailTableTd>
                      </DetailTableRow>
                    ))}
                  </DetailTableBody>
                </DetailTable>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}
