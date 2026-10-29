"use client"

import { useRouter } from "next/navigation"
import { useRef, useState, useTransition } from "react"

import { createTaxDisputeStep } from "@/actions/tax-dispute.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/shadcn/input"
import { Label } from "@/components/ui/shadcn/label"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { Combobox } from "@/components/ui/combobox"
import { AppDatePicker } from "@/components/ui/date-picker"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { TAX_DISPUTE_STEP_KIND_LABELS, TAX_DISPUTE_PASAL36_SUBKIND_LABELS } from "./tax-dispute-labels"

const KIND_OPTIONS = Object.entries(TAX_DISPUTE_STEP_KIND_LABELS).map(([value, label]) => ({
  value,
  label,
}))

const PASAL36_OPTIONS = Object.entries(TAX_DISPUTE_PASAL36_SUBKIND_LABELS).map(([value, label]) => ({
  value,
  label,
}))

export function TaxDisputeStepForm({ assessmentId }: { assessmentId: number }) {
  const router = useRouter()
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID())
  const [isPending, startTransition] = useTransition()

  const [kind, setKind] = useState("")
  const [article36Subkind, setArticle36Subkind] = useState("")
  const [filedAt, setFiledAt] = useState(toLocalDateOnly(new Date()))
  const [lateReason, setLateReason] = useState("")
  const [evidenceRef, setEvidenceRef] = useState("")

  const needsPasal36 = kind === "PENGURANGAN_PEMBATALAN"

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData()
        formData.set("idempotencyKey", idempotencyKeyRef.current)
        formData.set("assessmentId", String(assessmentId))
        formData.set("kind", kind)
        formData.set("article36Subkind", needsPasal36 ? article36Subkind : "")
        formData.set("filedAt", filedAt)
        formData.set("lateReason", lateReason)
        formData.set("evidenceRef", evidenceRef)

        const result = await createTaxDisputeStep(formData)
        if (result && !result.success) {
          showError(result.error || "Gagal menyimpan upaya sengketa")
          return
        }
        idempotencyKeyRef.current = crypto.randomUUID()
        showSuccess("Upaya sengketa tersimpan")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan upaya sengketa")
      }
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-busy={isPending}
      aria-label="Formulir ajukan upaya sengketa"
      className="flex flex-col gap-5 rounded-xl border border-default bg-surface p-6 shadow-sm"
    >
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="step-kind">Jenis Upaya *</Label>
          <Combobox
            id="step-kind"
            required
            options={KIND_OPTIONS}
            value={kind || null}
            onChange={(value) => setKind(value ?? "")}
            placeholder="Pilih jenis upaya"
          />
        </div>

        {needsPasal36 && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="article36Subkind">Sub-jenis Pasal 36 *</Label>
            <Combobox
              id="article36Subkind"
              required
              options={PASAL36_OPTIONS}
              value={article36Subkind || null}
              onChange={(value) => setArticle36Subkind(value ?? "")}
              placeholder="Wajib untuk pengurangan/pembatalan"
            />
          </div>
        )}

        <AppDatePicker label="Tanggal Pengajuan" name="filedAt" value={filedAt} onChange={setFiledAt} />

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="evidenceRef">Referensi Bukti</Label>
          <Input
            id="evidenceRef"
            value={evidenceRef}
            onChange={(e) => setEvidenceRef(e.target.value)}
            placeholder="Nomor surat/bukti (opsional)"
            maxLength={200}
          />
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="lateReason">Alasan Keterlambatan</Label>
          <Textarea
            id="lateReason"
            value={lateReason}
            onChange={(e) => setLateReason(e.target.value)}
            placeholder="Wajib diisi bila upaya melewati tenggat (keadaan di luar kekuasaan)"
            rows={3}
            maxLength={2000}
          />
          <span className="text-xs text-muted-foreground">
            Lewat tenggat bukan auto-ditolak: wajib sertakan alasan keadaan di luar kekuasaan.
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" isDisabled={isPending} aria-label="Simpan upaya sengketa">
          {isPending ? "Menyimpan…" : "Simpan Upaya"}
        </Button>
      </div>
    </form>
  )
}
