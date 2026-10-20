"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { Lock, LockOpen } from "lucide-react"

import { closeAccountingPeriod, reopenAccountingPeriod } from "@/actions/period-close.actions"
import { Button } from "@/components/ui/shadcn/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { AppMonthPicker } from "@/components/ui/month-picker"
import { showError, showSuccess } from "@/lib/utils/toast"

export interface PeriodClosePanelProps {
  monthKey: string
  monthLabel: string
  /** Tanggal akhir bulan (YYYY-MM-DD) yang akan dipasang sebagai kunci. */
  monthEnd: string
  currentLockDate: string | null
  /** Kunci yang berlaku sudah mencakup/melebihi bulan ini. */
  alreadyClosed: boolean
}

export function PeriodClosePanel({
  monthKey,
  monthLabel,
  monthEnd,
  currentLockDate,
  alreadyClosed,
}: PeriodClosePanelProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [busy, setBusy] = useState<"close" | "reopen" | null>(null)
  const [confirming, setConfirming] = useState<"close" | "reopen" | null>(null)

  function changeMonth(value: string) {
    if (!/^\d{4}-\d{2}$/.test(value)) return
    router.push(`/pengaturan/proses-akhir-bulan?periode=${value}`)
  }

  function handleClose() {
    setConfirming("close")
  }

  function doClose() {
    setConfirming(null)
    setBusy("close")
    startTransition(async () => {
      const formData = new FormData()
      formData.set("date", monthEnd)
      const result = await closeAccountingPeriod(formData)
      setBusy(null)
      if (result.success) {
        showSuccess(result.message ?? "Periode dikunci.")
        router.refresh()
      } else {
        showError(result.error ?? "Gagal mengunci periode.")
      }
    })
  }

  function handleReopen() {
    setConfirming("reopen")
  }

  function doReopen() {
    setConfirming(null)
    setBusy("reopen")
    startTransition(async () => {
      const result = await reopenAccountingPeriod()
      setBusy(null)
      if (result.success) {
        showSuccess(result.message ?? "Kunci periode dibuka.")
        router.refresh()
      } else {
        showError(result.error ?? "Gagal membuka kunci periode.")
      }
    })
  }

  const disabled = isPending

  return (
    <div className="flex flex-col gap-4">
      <div className="sm:max-w-xs">
        <AppMonthPicker
          label="Bulan yang ditutup"
          name="periode"
          value={monthKey}
          onChange={changeMonth}
          disabled={disabled}
          required
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={handleClose} disabled={disabled || alreadyClosed}>
          <Lock className="size-4" />
          {busy === "close" ? "Mengunci…" : `Kunci sampai ${monthEnd}`}
        </Button>
        {currentLockDate ? (
          <Button variant="outline" onClick={handleReopen} disabled={disabled}>
            <LockOpen className="size-4" />
            {busy === "reopen" ? "Membuka…" : "Buka kunci periode"}
          </Button>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">
        {currentLockDate
          ? `Kunci periode berlaku sampai ${currentLockDate}.`
          : "Periode belum pernah dikunci."}
        {alreadyClosed ? " Bulan ini sudah tercakup kunci yang berlaku, jadi menutupnya lagi tidak mengubah apa pun." : ""}
      </p>

      <ConfirmDialog
        isOpen={confirming === "close"}
        onOpenChange={(open) => { if (!open) setConfirming(null) }}
        title={`Kunci periode sampai ${monthLabel}?`}
        body="Setelah dikunci, jurnal bertanggal pada/sebelum tanggal itu tidak bisa diposting atau diubah."
        confirmLabel="Kunci periode"
        variant="warning"
        isPending={busy === "close"}
        onConfirm={doClose}
      />
      <ConfirmDialog
        isOpen={confirming === "reopen"}
        onOpenChange={(open) => { if (!open) setConfirming(null) }}
        title="Buka kunci periode?"
        body="Jurnal pada periode yang tadinya terkunci akan bisa diubah lagi."
        confirmLabel="Buka kunci"
        variant="warning"
        isPending={busy === "reopen"}
        onConfirm={doReopen}
      />
    </div>
  )
}
