"use client"

import { useRouter } from "next/navigation"
import { useRef, useState, useTransition } from "react"

import { recordTaxDisputeDecision } from "@/actions/tax-dispute.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Button } from "@/components/ui/button"
import { CurrencyInput } from "@/components/ui/currency-input"
import { Label } from "@/components/ui/shadcn/label"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { Combobox } from "@/components/ui/combobox"
import { AppDatePicker } from "@/components/ui/date-picker"
import { toLocalDateOnly } from "@/lib/utils/date-only"

const RESULT_OPTIONS = [
  { value: "DIKABULKAN", label: "Dikabulkan" },
  { value: "DIKABULKAN_SEBAGIAN", label: "Dikabulkan Sebagian" },
  { value: "DITOLAK", label: "Ditolak" },
  { value: "TIDAK_DAPAT_DITERIMA", label: "Tidak Dapat Diterima" },
]

export function TaxDisputeDecisionForm({
  steps,
}: {
  steps: { value: string; label: string }[]
}) {
  const router = useRouter()
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID())
  const [isPending, startTransition] = useTransition()

  const [stepId, setStepId] = useState("")
  const [result, setResult] = useState("")
  const [decidedAtInput, setDecidedAtInput] = useState(toLocalDateOnly(new Date()))
  const [decidedAmount, setDecidedAmount] = useState<number | null>(null)
  const [decisionNotes, setDecisionNotes] = useState("")

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData()
        formData.set("idempotencyKey", idempotencyKeyRef.current)
        formData.set("stepId", stepId)
        formData.set("result", result)
        formData.set("decidedAtInput", decidedAtInput)
        formData.set("decidedAmount", decidedAmount === null ? "" : String(decidedAmount))
        formData.set("decisionNotes", decisionNotes)

        const result_ = await recordTaxDisputeDecision(formData)
        if (result_ && !result_.success) {
          showError(result_.error || "Gagal mencatat putusan sengketa")
          return
        }
        idempotencyKeyRef.current = crypto.randomUUID()
        showSuccess("Putusan sengketa tercatat")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal mencatat putusan sengketa")
      }
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-busy={isPending}
      aria-label="Formulir catat putusan sengketa"
      className="flex flex-col gap-5 rounded-xl border border-default bg-surface p-6 shadow-sm"
    >
      <p className="text-sm text-muted-foreground">
        Empat mata: perekam putusan harus berbeda dari pengaju upaya — bila sama, server menolak.
      </p>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="decision-step">Upaya *</Label>
          <Combobox
            id="decision-step"
            required
            options={steps}
            value={stepId || null}
            onChange={(value) => setStepId(value ?? "")}
            placeholder={steps.length === 0 ? "Tidak ada upaya aktif" : "Pilih upaya"}
            disabled={steps.length === 0}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="decision-result">Hasil Putusan *</Label>
          <Combobox
            id="decision-result"
            required
            options={RESULT_OPTIONS}
            value={result || null}
            onChange={(value) => setResult(value ?? "")}
            placeholder="Pilih hasil putusan"
          />
        </div>

        <AppDatePicker label="Tanggal Putusan *" name="decidedAtInput" value={decidedAtInput} onChange={setDecidedAtInput} required />

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="decidedAmount">Nominal Putusan</Label>
          <CurrencyInput id="decidedAmount" value={decidedAmount} onChange={setDecidedAmount} placeholder="0" aria-describedby="decidedAmount-hint" />
          <span id="decidedAmount-hint" className="text-xs text-muted-foreground">
            Tidak boleh melebihi nominal disengketakan.
          </span>
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="decisionNotes">Catatan Putusan</Label>
          <Textarea
            id="decisionNotes"
            value={decisionNotes}
            onChange={(e) => setDecisionNotes(e.target.value)}
            placeholder="Catatan putusan (opsional)"
            rows={3}
            maxLength={2000}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" isDisabled={isPending || steps.length === 0} aria-label="Catat putusan sengketa">
          {isPending ? "Menyimpan…" : "Catat Putusan"}
        </Button>
      </div>
    </form>
  )
}
