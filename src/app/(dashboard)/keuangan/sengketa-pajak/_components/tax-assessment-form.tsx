"use client"

import { useRouter } from "next/navigation"
import { useRef, useState, useTransition } from "react"

import { createTaxAssessment } from "@/actions/tax-dispute.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Button } from "@/components/ui/button"
import { CurrencyInput } from "@/components/ui/currency-input"
import { Input } from "@/components/ui/shadcn/input"
import { Label } from "@/components/ui/shadcn/label"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { Combobox } from "@/components/ui/combobox"
import { AppDatePicker } from "@/components/ui/date-picker"
import { toLocalDateOnly } from "@/lib/utils/date-only"

const KIND_OPTIONS = [
  { value: "SKPKB", label: "SKPKB" },
  { value: "SKPKBT", label: "SKPKBT" },
  { value: "SKPLB", label: "SKPLB" },
  { value: "SKPN", label: "SKPN" },
  { value: "PEMUNGUTAN_PIHAK_KETIGA", label: "Pemungutan Pihak Ketiga" },
]

const TAX_KIND_OPTIONS = [
  { value: "ppn", label: "PPN" },
  { value: "pph21", label: "PPh 21" },
  { value: "pph23", label: "PPh 23" },
  { value: "pph4_2", label: "PPh Final 4(2)" },
  { value: "pph_badan", label: "PPh Badan" },
  { value: "other", label: "Lainnya" },
]

export function TaxAssessmentForm() {
  const router = useRouter()
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID())
  const [isPending, startTransition] = useTransition()

  const [assessmentNumber, setAssessmentNumber] = useState("")
  const [kind, setKind] = useState("")
  const [taxKind, setTaxKind] = useState("")
  const [assessedAmount, setAssessedAmount] = useState<number | null>(null)
  const [disputedAmount, setDisputedAmount] = useState<number | null>(null)
  const [sentAt, setSentAt] = useState(toLocalDateOnly(new Date()))
  const [receivedAt, setReceivedAt] = useState("")
  const [notes, setNotes] = useState("")

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData()
        formData.set("idempotencyKey", idempotencyKeyRef.current)
        formData.set("assessmentNumber", assessmentNumber)
        formData.set("kind", kind)
        formData.set("taxKind", taxKind)
        formData.set("assessedAmount", assessedAmount === null ? "" : String(assessedAmount))
        formData.set("disputedAmount", disputedAmount === null ? "" : String(disputedAmount))
        formData.set("sentAt", sentAt)
        formData.set("receivedAt", receivedAt)
        formData.set("notes", notes)

        const result = await createTaxAssessment(formData)
        if (result && !result.success) {
          showError(result.error || "Gagal menyimpan ketetapan pajak")
          return
        }
        idempotencyKeyRef.current = crypto.randomUUID()
        showSuccess("Ketetapan pajak tersimpan")
        router.push("/keuangan/sengketa-pajak")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan ketetapan pajak")
      }
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-busy={isPending}
      aria-label="Formulir daftar ketetapan pajak"
      className="flex flex-col gap-5 rounded-xl border border-default bg-surface p-6 shadow-sm"
    >
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="assessmentNumber">
            Nomor Ketetapan <span className="text-destructive" aria-hidden="true">*</span>
          </Label>
          <Input
            id="assessmentNumber"
            value={assessmentNumber}
            onChange={(e) => setAssessmentNumber(e.target.value)}
            placeholder="Mis. 00001/206/2026"
            required
            maxLength={50}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="kind">Jenis Ketetapan *</Label>
          <Combobox
            id="kind"
            required
            options={KIND_OPTIONS}
            value={kind || null}
            onChange={(value) => setKind(value ?? "")}
            placeholder="Pilih jenis ketetapan"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="taxKind">Jenis Pajak</Label>
          <Combobox
            id="taxKind"
            options={TAX_KIND_OPTIONS}
            value={taxKind || null}
            onChange={(value) => setTaxKind(value ?? "")}
            placeholder="Opsional"
          />
        </div>

        <AppDatePicker label="Tanggal Kirim SKP *" name="sentAt" value={sentAt} onChange={setSentAt} required />

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="assessedAmount">
            Nominal Ketetapan <span className="text-destructive" aria-hidden="true">*</span>
          </Label>
          <CurrencyInput id="assessedAmount" value={assessedAmount} onChange={setAssessedAmount} placeholder="0" required />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="disputedAmount">
            Nominal Disengketakan <span className="text-destructive" aria-hidden="true">*</span>
          </Label>
          <CurrencyInput id="disputedAmount" value={disputedAmount} onChange={setDisputedAmount} placeholder="0" required />
          <span className="text-xs text-muted-foreground">
            Tidak boleh melebihi nominal ketetapan.
          </span>
        </div>

        <AppDatePicker label="Tanggal Terima Internal" name="receivedAt" value={receivedAt} onChange={setReceivedAt} />

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="notes">Keterangan</Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Catatan register (opsional)"
            rows={3}
            maxLength={2000}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" isDisabled={isPending} aria-label="Simpan ketetapan pajak">
          {isPending ? "Menyimpan…" : "Simpan Ketetapan"}
        </Button>
        <Button type="button" variant="outline" isDisabled={isPending} onClick={() => router.back()}>
          Batal
        </Button>
      </div>
    </form>
  )
}
