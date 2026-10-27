"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { matchReconciliationLine } from "@/actions/finance.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/shadcn/label"
import { FormSelect } from "@/components/ui/form-select"

export type MatchLineOption = {
  id: number
  label: string
}

// Formulir pencocokan baris: satu-satunya UI yang memanggil
// matchReconciliationLine. Sebelum ini aksi tersebut tidak punya pemanggil UI —
// rekonsiliasi hanya bisa dibuat dan diselesaikan tanpa pernah mencocokkan baris.
//
// Field yang dikirim: lineId dan journalEntryId diambil dari state (bukan
// FormData), keduanya ID numerik yang sudah divalidasi ulang di sisi server
// (akun, periode, status POSTED).
export function MatchLineForm({
  reconciliationId,
  statementLines,
  journalEntries,
}: {
  reconciliationId: number
  statementLines: MatchLineOption[]
  journalEntries: MatchLineOption[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [lineId, setLineId] = useState("")
  const [journalEntryId, setJournalEntryId] = useState("")

  function onSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const line = Number(lineId)
    const entry = Number(journalEntryId)
    if (!Number.isInteger(line) || !Number.isInteger(entry)) {
      showError("Pilih baris rekening koran dan entri jurnal")
      return
    }
    startTransition(async () => {
      const res = await matchReconciliationLine(reconciliationId, line, entry)
      if (!res.success) {
        showError(res.error || "Gagal mencocokkan baris")
        return
      }
      showSuccess("Baris berhasil dicocokkan")
      setLineId("")
      setJournalEntryId("")
      router.refresh()
    })
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-3 p-4 px-5 border-b border-default"
      aria-label="Cocokkan baris rekonsiliasi"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="matchLineId">Baris Rekening Koran *</Label>
          <FormSelect
            id="matchLineId"
            value={lineId}
            onValueChange={setLineId}
            placeholder="-- Pilih Baris --"
            options={statementLines.map((o) => ({ value: String(o.id), label: o.label }))}
          />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="matchJournalEntryId">Entri Jurnal *</Label>
          <FormSelect
            id="matchJournalEntryId"
            value={journalEntryId}
            onValueChange={setJournalEntryId}
            placeholder="-- Pilih Entri Jurnal --"
            options={journalEntries.map((o) => ({ value: String(o.id), label: o.label }))}
          />
        </div>
        <div className="flex gap-2">
          <Button type="submit" variant="primary" isDisabled={isPending}>
            {isPending ? "Mencocokkan..." : "Cocokkan"}
          </Button>
        </div>
      </div>
    </form>
  )
}
