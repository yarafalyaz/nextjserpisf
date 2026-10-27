"use client"

import { useState } from "react"
import { reopenProductionOrder, reopenWorkOrder } from "@/actions/manufacturing.actions"
import { useActionRunner } from "./use-action-runner"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Label } from "@/components/ui/shadcn/label"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { showError } from "@/lib/utils/toast"

/**
 * F-2026-10-21-009-V / F-2026-10-24-097-S: tombol Buka Kembali (reopen) job
 * berstatus closed di halaman detail. Aksi server `reopenWorkOrder` /
 * `reopenProductionOrder` sudah live dan teruji, tetapi sebelumnya yatim
 * tanpa pemanggil UI (entri beku action-wiring). Pola mengikuti kartu
 * antrean tutup job (`WorkshopCloseoutQueueCard`): ConfirmDialog + alasan
 * wajib, pesan server tampil verbatim lewat `useActionRunner`. Izin tombol
 * diputus page dari permission yang sama dengan penegakan server
 * (WO: complete_work_orders, PO: edit_production_orders); server tetap
 * penegak tunggal. Reopen hanya mengubah status closed -> completed dan
 * jejak audit — tanpa jurnal atau mutasi stok.
 */
export function JobReopenButton({
  kind,
  id,
  code,
  status,
  canReopen,
}: Readonly<{
  kind: "work_order" | "production_order"
  id: number
  code: string
  status: string
  canReopen: boolean
}>) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const { isPending, run } = useActionRunner("Gagal membuka kembali job. Silakan coba lagi.")

  if (status !== "closed" || !canReopen) return null

  const fieldId = `reopen-reason-${kind}-${id}`

  function submitReopen() {
    const trimmed = reason.trim()
    if (!trimmed) {
      // Cermin pesan server validateReopenReason: tolak sebelum memanggil aksi.
      showError("Alasan reopen wajib diisi (tidak boleh kosong/spasi).")
      return
    }
    run(
      () =>
        kind === "work_order"
          ? reopenWorkOrder(id, trimmed)
          : reopenProductionOrder(id, trimmed),
      "Job dibuka kembali. Status kini completed.",
      () => {
        setOpen(false)
        setReason("")
      },
    )
  }

  return (
    <>
      <button
        type="button"
        className="inline-flex min-h-11 items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover transition-all disabled:opacity-50"
        disabled={isPending}
        aria-label={`Buka Kembali Job ${code}`}
        onClick={() => {
          setReason("")
          setOpen(true)
        }}
      >
        Buka Kembali Job
      </button>

      <ConfirmDialog
        isOpen={open}
        onOpenChange={setOpen}
        title={`Buka Kembali Job ${code}?`}
        confirmLabel="Ya, Buka Kembali"
        variant="primary"
        isPending={isPending}
        onConfirm={submitReopen}
      >
        <div className="flex flex-col gap-3">
          <p>
            Job yang dibuka kembali berstatus completed dan dapat menerima biaya lagi. Alasan wajib
            diisi dan tercatat di jejak aktivitas beserta jejak penutupan sebelumnya.
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={fieldId}>Alasan Buka Kembali</Label>
            <Textarea
              id={fieldId}
              rows={3}
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Contoh: ada tagihan subkontrak telat yang harus masuk biaya job."
            />
          </div>
          {reason.trim() === "" ? (
            <p className="text-xs text-muted-foreground">Isi alasan untuk melanjutkan.</p>
          ) : null}
        </div>
      </ConfirmDialog>
    </>
  )
}
