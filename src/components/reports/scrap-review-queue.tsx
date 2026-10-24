"use client"

import { useState } from "react"
import { reviewAbnormalScrap } from "@/actions/inventory.actions"
import { Button } from "@/components/ui/button"
import { FormSelect } from "@/components/ui/form-select"
import { formatDate, formatNumber } from "@/lib/utils/format"
import { useActionRunner } from "./use-action-runner"
import { cn } from "@/lib/utils"

/** Baris antrean tinjau scrap abnormal (loader page; angka snapshot builder apa adanya). */
export interface ScrapReviewQueueRow {
  source: "MI" | "PO"
  lineId: number
  documentNo: string
  date: Date | string
  itemName: string | null
  abnormalQty: number
  abnormalValue: number
  scrapReasonLabel: string | null
  allowanceNote: string | null
  materialShape: string | null
}

export const SCRAP_REVIEW_DISPOSITION_OPTIONS = [
  { value: "diterima_wajar", label: "Diterima wajar" },
  { value: "kelalaian", label: "Kelalaian" },
] as const

export type ScrapReviewDispositionValue = (typeof SCRAP_REVIEW_DISPOSITION_OPTIONS)[number]["value"]

/** Gerbang kirim disposisi: kelalaian wajib catatan; diterima_wajar catatan opsional. */
export function isScrapReviewSubmitDisabled(input: {
  isPending: boolean
  disposition: string
  note: string
}): boolean {
  if (input.isPending) return true
  if (input.disposition !== "diterima_wajar" && input.disposition !== "kelalaian") return true
  if (input.disposition === "kelalaian" && !input.note.trim()) return true
  return false
}

const SHAPE_LABELS: Record<string, string> = {
  plat: "Plat",
  profil: "Profil",
  lain: "Lain",
}

function ReviewForm({
  row,
  onDone,
}: Readonly<{ row: ScrapReviewQueueRow; onDone: () => void }>) {
  const { isPending, run } = useActionRunner("Gagal meninjau scrap abnormal")
  const [disposition, setDisposition] = useState("")
  const [note, setNote] = useState("")
  const disabled = isScrapReviewSubmitDisabled({ isPending, disposition, note })
  const noteId = `scrap-review-note-${row.source}-${row.lineId}`
  const dispId = `scrap-review-disposition-${row.source}-${row.lineId}`

  return (
    <div className="flex flex-col gap-3 border-t border-default pt-3">
      <div className="flex flex-col gap-1">
        <label htmlFor={dispId} className="text-sm font-medium text-foreground">
          Disposisi tinjau <span aria-hidden="true" className="text-destructive">*</span>
        </label>
        <FormSelect
          id={dispId}
          aria-label="Disposisi tinjau"
          required
          placeholder="-- Pilih disposisi --"
          value={disposition}
          onValueChange={setDisposition}
          options={[...SCRAP_REVIEW_DISPOSITION_OPTIONS]}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={noteId} className="text-sm font-medium text-foreground">
          Catatan tinjau{disposition === "kelalaian" ? (
            <> <span aria-hidden="true" className="text-destructive">*</span></>
          ) : null}
        </label>
        <textarea
          id={noteId}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          required={disposition === "kelalaian"}
          aria-required={disposition === "kelalaian" ? "true" : undefined}
          rows={2}
          maxLength={500}
          className="min-h-11 rounded-lg border border-default bg-background px-3 py-2 text-sm"
          placeholder={disposition === "kelalaian" ? "Catatan dan tindak lanjut wajib…" : "Catatan (opsional)…"}
        />
        {disposition === "kelalaian" ? (
          <p role="note" className="text-xs text-muted-foreground">
            Disposisi kelalaian wajib disertai catatan dan tindak lanjut.
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" isDisabled={isPending} onPress={onDone}>
          Batal
        </Button>
        <Button
          variant="primary"
          isDisabled={disabled}
          onPress={() =>
            run(
              () =>
                reviewAbnormalScrap({
                  source: row.source,
                  lineId: row.lineId,
                  disposition,
                  note: note.trim() || undefined,
                }),
              "Scrap abnormal ditinjau",
              onDone,
            )
          }
        >
          Simpan Tinjauan
        </Button>
      </div>
    </div>
  )
}

/**
 * Antrean tinjau scrap abnormal (F-2026-10-24-098-S). Baris menunggu_tinjau
 * dari loader page ditampilkan apa adanya — UI tidak hitung ulang klasifikasi.
 * Aksi disposisi hanya dirender bila canReview (izin complete_work_orders);
 * server tetap penegak. Tanpa izin: antrean baca-saja + penjelasan.
 */
export function ScrapReviewQueue({
  rows,
  canReview,
}: Readonly<{ rows: ScrapReviewQueueRow[]; canReview: boolean }>) {
  const [openKey, setOpenKey] = useState<string | null>(null)

  return (
    <section
      aria-label="Antrean tinjau scrap abnormal"
      className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 px-5 border-b border-default">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Antrean Tinjau Scrap Abnormal</h2>
          <p className="text-xs text-muted-foreground">
            Baris scrap abnormal menunggu disposisi foreman. Tinjau operasional saja — tidak mengubah
            klasifikasi, nilai, atau jurnal.
          </p>
        </div>
        <span
          className={cn(
            "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
            rows.length > 0
              ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
              : "bg-muted text-muted-foreground",
          )}
        >
          {rows.length} menunggu tinjau
        </span>
      </div>

      <div className="p-4 px-5 flex flex-col gap-3">
        {!canReview ? (
          <p role="note" className="text-sm text-muted-foreground">
            Anda tidak memiliki izin menyelesaikan perintah kerja (complete_work_orders), sehingga
            disposisi tinjau tidak dapat dilakukan dari akun ini. Antrean tampil baca-saja.
          </p>
        ) : null}

        {rows.length === 0 ? (
          <p className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
            Tidak ada scrap abnormal menunggu tinjau pada periode ini
          </p>
        ) : (
          rows.map((row) => {
            const key = `${row.source}-${row.lineId}`
            const open = openKey === key
            return (
              <article
                key={key}
                aria-label={`Tinjau scrap ${row.source} ${row.documentNo}`}
                className="rounded-lg border border-default overflow-hidden"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/30 px-3 py-2">
                  <span className="text-sm font-medium text-foreground">
                    {row.source} {row.documentNo}
                    {row.itemName ? <> — {row.itemName}</> : null}
                  </span>
                  <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
                    Abnormal belum ditinjau
                  </span>
                </div>
                <div className="flex flex-col gap-2 px-3 py-3">
                  <p className="text-sm text-foreground">
                    Tanggal {formatDate(row.date, { format: "numeric" })} · Qty abnormal{" "}
                    {formatNumber(row.abnormalQty, 2)} · Nilai abnormal{" "}
                    {formatNumber(row.abnormalValue, 2)}
                    {row.scrapReasonLabel ? <> · Alasan: {row.scrapReasonLabel}</> : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Bentuk bahan:{" "}
                    {row.materialShape ? (SHAPE_LABELS[row.materialShape] ?? row.materialShape) : "Belum ditetapkan"}
                    {" · "}Acuan allowance: {row.allowanceNote ?? "Belum ditetapkan"}
                  </p>
                  {canReview && !open ? (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button variant="primary" size="sm" onPress={() => setOpenKey(key)}>
                        Tinjau
                      </Button>
                    </div>
                  ) : null}
                  {canReview && open ? (
                    <ReviewForm row={row} onDone={() => setOpenKey(null)} />
                  ) : null}
                </div>
              </article>
            )
          })
        )}
      </div>
    </section>
  )
}
