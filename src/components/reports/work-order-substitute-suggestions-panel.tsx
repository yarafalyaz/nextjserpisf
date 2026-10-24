"use client"

import { useState } from "react"
import { applyWorkOrderItemSubstitute } from "@/actions/item-substitute.actions"
import type { SubstituteSuggestionReport } from "@/lib/reports/item-substitute-suggestions"
import { PART_STATUS_LABEL } from "@/lib/reports/work-order-part-status-labels"
import { Button } from "@/components/ui/button"
import { showError, showSuccess } from "@/lib/utils/toast"
import { useActionRunner } from "./use-action-runner"

type Suggestion = SubstituteSuggestionReport["rows"][number]["suggestions"][number]
type Row = SubstituteSuggestionReport["rows"][number]

interface ApplyTarget {
  row: Row
  suggestion: Suggestion
}

/**
 * Panel saran substitusi part WO (F-2026-10-22-069-S, AC-SUB69-6/7).
 * Konsumen loader BOT 3 PR #595. Notice/stok efektif/fitment/alasan dari
 * server verbatim — UI nol hitung ulang. Pengganti rejected tetap tampil
 * ditolak dengan alasan; tombol Pakai Substitusi hanya canApply
 * (edit_work_orders, ditegakkan ulang server).
 */
export function WorkOrderSubstituteSuggestionsPanel({
  workOrderId,
  report,
  canApply,
}: Readonly<{
  workOrderId: number
  report: SubstituteSuggestionReport
  canApply: boolean
}>) {
  const { isPending, run } = useActionRunner("Gagal menerapkan substitusi")
  const [target, setTarget] = useState<ApplyTarget | null>(null)
  const [reason, setReason] = useState("")
  const [qty, setQty] = useState("")

  const suggestedRows = report.rows.filter((r) => r.suggestions.length > 0)
  if (suggestedRows.length === 0) return null

  function openApply(row: Row, suggestion: Suggestion) {
    setTarget({ row, suggestion })
    setReason("")
    setQty(String(row.qty))
  }

  function submitApply() {
    if (!target) return
    if (!reason.trim()) {
      showError("Alasan substitusi wajib diisi")
      return
    }
    const parsedQty = qty.trim() === "" ? undefined : Number(qty)
    run(
      async () => {
        const res = await applyWorkOrderItemSubstitute({
          workOrderId,
          workOrderItemId: target.row.workOrderItemId,
          substituteItemId: target.suggestion.substituteItemId,
          ...(parsedQty != null && parsedQty !== target.row.qty ? { qty: parsedQty } : {}),
          reason: reason.trim(),
        })
        if (res.success) {
          if (res.releaseNotice) showSuccess(res.releaseNotice)
          if (res.auditWarning) showError(res.auditWarning)
        }
        return res
      },
      "Substitusi diterapkan",
      () => {
        setTarget(null)
        setReason("")
        setQty("")
      },
    )
  }

  return (
    <section
      aria-label="Saran substitusi part"
      className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 px-5 border-b border-default">
        <h2 className="text-[0.9375rem] font-semibold text-foreground">Saran Substitusi Part</h2>
        <p className="text-xs text-muted-foreground">{report.suggestedLineCount} baris ada substitusi</p>
      </div>
      <div className="p-4 px-5 flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">{report.notice}</p>
        {suggestedRows.map((row) => (
          <div key={row.workOrderItemId} className="flex flex-col gap-2">
            <p className="text-sm font-medium text-foreground">
              {row.description ?? `Barang #${row.itemId}`}{" "}
              <span className="font-normal text-muted-foreground">
                — Butuh {row.qty}, Status: {PART_STATUS_LABEL[row.partStatus]}
                {row.shortageQty > 0 ? `, Kekurangan ${row.shortageQty}` : ""}
              </span>
            </p>
            <span className="inline-flex w-fit rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              Ada substitusi
            </span>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th scope="col" className="py-1 pr-2 font-medium">Pengganti</th>
                    <th scope="col" className="py-1 pr-2 font-medium">SKU</th>
                    <th scope="col" className="py-1 pr-2 font-medium text-right">Stok efektif</th>
                    <th scope="col" className="py-1 pr-2 font-medium">Kecocokan kendaraan</th>
                    <th scope="col" className="py-1 font-medium">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {row.suggestions.map((s) => (
                    <tr key={s.substituteId} className="border-t border-default">
                      <td className="py-2 pr-2">
                        <span className="flex flex-col gap-0.5">
                          <span>{s.substituteName}</span>
                          {s.notes ? <span className="text-xs text-muted-foreground">{s.notes}</span> : null}
                          {s.substituteShortage ? (
                            <span className="text-xs text-danger">Stok pengganti juga kurang</span>
                          ) : null}
                        </span>
                      </td>
                      <td className="py-2 pr-2 font-mono text-xs">{s.substituteSku}</td>
                      <td className="py-2 pr-2 text-right">
                        {s.effectiveAvailableQty} {s.substituteUnitOfMeasure}
                      </td>
                      <td className="py-2 pr-2">
                        {s.rejected ? (
                          <span className="flex flex-col gap-0.5">
                            <span className="inline-flex w-fit rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-500/15 dark:text-red-400">
                              Ditolak
                            </span>
                            <span className="text-xs text-muted-foreground">{s.fitmentReason}</span>
                          </span>
                        ) : (
                          <span className="flex flex-col gap-0.5">
                            <span>{s.fitment}</span>
                            <span className="text-xs text-muted-foreground">{s.fitmentReason}</span>
                          </span>
                        )}
                      </td>
                      <td className="py-2">
                        {canApply ? (
                          <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            isDisabled={isPending || s.rejected}
                            onPress={() => openApply(row, s)}
                          >
                            Pakai Substitusi
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Hanya pengguna berizin edit_work_orders yang dapat memakai substitusi.
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      {target ? (
        <div
          className="mx-4 mb-4 flex flex-col gap-3 rounded-lg border border-default p-4 px-5"
          role="region"
          aria-label="Formulir pakai substitusi"
        >
          <h3 className="text-sm font-semibold text-foreground">Pakai Substitusi</h3>
          <p className="text-sm">
            Ganti {target.row.description ?? `Barang #${target.row.itemId}`} dengan{" "}
            {target.suggestion.substituteName} ({target.suggestion.substituteSku})?
          </p>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="substitute-qty" className="text-sm font-medium text-foreground">
              Qty pengganti
            </label>
            <input
              id="substitute-qty"
              type="number"
              min="0"
              step="any"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="min-h-11 w-full rounded-md border border-default bg-surface px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="substitute-reason" className="text-sm font-medium text-foreground">
              Alasan substitusi
            </label>
            <textarea
              id="substitute-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-default bg-surface px-3 py-2 text-sm"
              placeholder="Alasan memakai pengganti ini"
            />
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="primary"
              size="sm"
              isDisabled={isPending || !reason.trim()}
              onPress={submitApply}
            >
              Pakai Substitusi
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              isDisabled={isPending}
              onPress={() => setTarget(null)}
            >
              Batal
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
