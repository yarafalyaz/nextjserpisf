"use client"

import { useRouter } from "next/navigation"
import { useRef, useState, useTransition } from "react"
import { AppDatePicker } from "@/components/ui/date-picker"
import { CurrencyInput } from "@/components/ui/currency-input"
import { FormAttachmentUpload } from "@/components/ui/form-attachment-upload"
import { createReimbursementClaim } from "@/actions/reimbursement.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { FormSelect } from "@/components/ui/form-select"
import { Button } from "@/components/ui/button"
import { FormGrid, FormGroup } from "@/components/ui/form-layout"
import { toLocalDateOnly } from "@/lib/utils/date-only"

function newIdempotencyKey(): string {
  return crypto.randomUUID()
}

interface DuplicateCandidate {
  id: number
  documentNo: string
  status: string
}

interface ReimbursementClaimFormProps {
  categories: { id: number; label: string }[]
  projects: { id: number; name: string; documentNo: string | null }[]
}

/**
 * Form klaim reimbursement mandiri (F-2026-10-25-017-S).
 * Pengaju ditetapkan server dari scope — form ini TIDAK mengirim
 * employeeId dan TIDAK menyediakan pilihan akun GL (BR-RB-06):
 * akun beban ditetapkan keuangan lewat panel verifikasi.
 */
export function ReimbursementClaimForm({ categories, projects }: ReimbursementClaimFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [amount, setAmount] = useState(0)
  const [date, setDate] = useState(toLocalDateOnly(new Date()))
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[] | null>(null)
  const idempotencyKeyRef = useRef<string>(newIdempotencyKey())
  const formRef = useRef<HTMLFormElement>(null)

  function submit(acknowledgeDuplicates: boolean) {
    const form = formRef.current
    if (!form) return
    startTransition(async () => {
      try {
        const formData = new FormData(form)
        formData.set("amount", String(amount))
        formData.set("date", date)
        if (categoryId) formData.set("categoryId", categoryId)
        else formData.delete("categoryId")
        if (projectId) formData.set("projectId", projectId)
        else formData.delete("projectId")
        formData.set("idempotencyKey", idempotencyKeyRef.current)
        if (acknowledgeDuplicates) formData.set("acknowledgeDuplicates", "1")
        const result = await createReimbursementClaim(formData)
        if (result && !result.success) {
          const candidates =
            "duplicateCandidates" in result ? result.duplicateCandidates : undefined
          if (candidates && candidates.length > 0) {
            setDuplicates(candidates)
          }
          showError(result.error || "Gagal mengajukan klaim")
          return
        }
        idempotencyKeyRef.current = newIdempotencyKey()
        showSuccess(`Klaim ${result.documentNo} berhasil diajukan`)
        router.push("/sdm/klaim-reimbursement")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal mengajukan klaim")
      }
    })
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    submit(false)
  }

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      aria-busy={isPending}
      aria-label="Formulir ajukan klaim reimbursement"
      className="bg-surface rounded-xl border border-default shadow-sm p-6"
    >
      <FormGrid>
        <FormGroup>
          <Label htmlFor="amount">
            Jumlah (Rp) <span className="text-destructive" aria-hidden="true">*</span>
          </Label>
          <CurrencyInput
            id="amount"
            required
            value={amount}
            onChange={setAmount}
            placeholder="0"
            prefix="Rp"
          />
        </FormGroup>
        <FormGroup>
          <AppDatePicker
            label="Tanggal Pengeluaran"
            name="date"
            value={date}
            onChange={setDate}
            required
          />
        </FormGroup>
        <FormGroup>
          <Label htmlFor="referenceNo">No. Nota / Referensi</Label>
          <Input id="referenceNo" name="referenceNo" placeholder="Nomor nota dari toko..." />
          <p className="text-xs text-muted-foreground">
            Wajib terisi sebelum klaim dapat disetujui keuangan.
          </p>
        </FormGroup>
        <FormGroup>
          <Label htmlFor="categoryId">Kategori</Label>
          <FormSelect
            id="categoryId"
            value={categoryId}
            onValueChange={setCategoryId}
            placeholder="-- Pilih kategori --"
            options={categories.map((cat) => ({ value: String(cat.id), label: cat.label }))}
          />
        </FormGroup>
        <FormGroup>
          <Label htmlFor="projectId">Proyek</Label>
          <FormSelect
            id="projectId"
            value={projectId}
            onValueChange={setProjectId}
            placeholder="-- Pilih proyek --"
            options={projects.map((p) => ({
              value: String(p.id),
              label: p.documentNo ? `${p.documentNo} - ${p.name}` : p.name,
            }))}
          />
        </FormGroup>
        <FormGroup>
          <FormAttachmentUpload referenceType="expense" label="Lampiran Bukti (nota/foto)" />
        </FormGroup>
        <FormGroup full>
          <Label htmlFor="description">Keterangan</Label>
          <Textarea
            id="description"
            name="description"
            rows={3}
            placeholder="Keterangan pengeluaran yang diklaim..."
          />
        </FormGroup>
      </FormGrid>

      {duplicates && duplicates.length > 0 && (
        <div
          role="alert"
          className="mt-6 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm"
        >
          <p className="font-medium text-foreground">Ditemukan klaim serupa yang belum selesai:</p>
          <ul className="mt-2 list-disc pl-5">
            {duplicates.map((candidate) => (
              <li key={candidate.id}>
                <span className="font-mono">{candidate.documentNo}</span> — status {candidate.status}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-muted-foreground">
            Bila ini memang pengeluaran berbeda, ajukan ulang dengan pengakuan di bawah.
          </p>
          <div className="mt-3">
            <Button
              type="button"
              variant="primary"
              isDisabled={isPending}
              onPress={() => submit(true)}
            >
              Tetap Ajukan (pengeluaran berbeda)
            </Button>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <Button type="button" onPress={() => router.back()}>
          Batal
        </Button>
        <Button type="submit" variant="primary" isDisabled={isPending} id="submit-reimbursement-claim">
          {isPending ? "Mengajukan..." : "Ajukan Klaim"}
        </Button>
      </div>
    </form>
  )
}
