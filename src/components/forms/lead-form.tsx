"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useRef, useState, useTransition } from "react"
import { AlertTriangle } from "lucide-react"
import { createLead, updateLead } from "@/actions/master.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { formatDate } from "@/lib/utils/format"
import { statusLabel } from "@/lib/utils/status-labels"
import {
  LEAD_LOST_REASON_CATEGORIES,
  LEAD_LOST_REASON_FREE_TEXT_MAX,
  isLeadLostReasonCategoryKey,
} from "@/lib/reports/lead-lost-reason"
// Tipe respons createLead/updateLead (kontrak Backend PR #771,
// lead-duplicate.service.ts) — didefinisikan lokal: modul service
// menarik Prisma ke bundle klien (node:fs) dan mematahkan build.
// Kata tampil verbatim §7 spec F-2026-10-24-141-S.
const DUPLICATE_LOST_LABEL = "Lead lama berstatus lost — bukan duplikat aktif"

interface LeadDuplicateCandidate {
  id: number
  leadNumber: string | null
  slug: string | null
  name: string
  company: string | null
  status: string
  isConverted: boolean
  isLost: boolean
  assignedTo: number | null
  assignedToName: string | null
  createdAt: Date | string
  matchKind: "phone" | "email" | "both"
  matchLabel: string
  phone: string | null
  email: string | null
  canOpen: boolean
}

interface LeadDuplicateWarning {
  title: string
  body: string
  candidates: LeadDuplicateCandidate[]
  lostCandidates: LeadDuplicateCandidate[]
  requiresReason: boolean
  minReasonLength: number
}
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { FormSelect } from "@/components/ui/form-select"
import { Combobox } from "@/components/ui/combobox"
import { AppDatePicker } from "@/components/ui/date-picker"
import { CurrencyInput } from "@/components/ui/currency-input"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/shadcn/alert"
import { Button } from "@/components/ui/button"

function DuplicateCandidateRow({ candidate }: { candidate: LeadDuplicateCandidate }) {
  return (
    <li className="rounded-lg border border-default bg-surface px-3 py-2.5 text-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-medium">
          {candidate.leadNumber ?? "-"} — {candidate.name}
          {candidate.company ? ` (${candidate.company})` : ""}
        </span>
        {candidate.canOpen && candidate.slug ? (
          <Link
            href={`/crm/leads/${candidate.slug}`}
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            Buka lead existing
          </Link>
        ) : null}
      </div>
      <p className="mt-1 text-muted-foreground">
        Status: {candidate.isLost ? DUPLICATE_LOST_LABEL : statusLabel(candidate.status)} · Pemilik:{" "}
        {candidate.assignedToName ?? "-"} · {candidate.matchLabel} · Dibuat {formatDate(candidate.createdAt)}
      </p>
      {(candidate.phone || candidate.email) && (
        <p className="mt-0.5 text-muted-foreground">
          {[candidate.phone, candidate.email].filter(Boolean).join(" · ")}
        </p>
      )}
    </li>
  )
}

interface LeadFormProps {
  lead?: {
    id: number
    leadNumber?: string | null
    name: string
    email: string | null
    phone: string | null
    company: string | null
    contactName: string | null
    position: string | null
    industry: string | null
    estimatedValue: number | string | null
    expectedCloseDate: string | null
    address: string | null
    source: string | null
    notes: string | null
    status: string | null
    assignedTo: number | null
  }
  users?: { id: number; name: string }[]
}

export function LeadForm({ lead, users = [] }: LeadFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const isEdit = !!lead
  // F-2026-10-25-030-S: won/lost terminal mutlak di server (Q-LR-4) —
  // status terminal tidak ditawarkan sebagai pilihan agar aksi yang
  // pasti ditolak tidak tampil; kategori hanya dikirim saat status=lost
  // (server menolak kategori pada status lain).
  const isTerminalStatus = lead?.status === "won" || lead?.status === "lost"
  const [status, setStatus] = useState(lead?.status ?? "")
  const [lostReasonCategory, setLostReasonCategory] = useState("")
  const [lostReasonText, setLostReasonText] = useState("")
  const [source, setSource] = useState(lead?.source ?? "")
  const [assignedTo, setAssignedTo] = useState<string | null>(lead?.assignedTo ? String(lead.assignedTo) : null)
  // DUP-F1 (F-2026-10-24-141-S §7): peringatan duplikat dari respons
  // server; input form tidak di-reset saat panel tampil.
  const [duplicateWarning, setDuplicateWarning] = useState<LeadDuplicateWarning | null>(null)
  const [overrideReason, setOverrideReason] = useState("")
  const [overrideError, setOverrideError] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  function submitForm(formData: FormData, withReason: string | null) {
    startTransition(async () => {
      try {
        if (withReason) formData.set("duplicateOverrideReason", withReason)
        const result = isEdit ? await updateLead(lead!.id, formData) : await createLead(formData)
        if (result && !result.success) {
          const warning = "duplicateWarning" in result ? result.duplicateWarning : undefined
          if (warning) {
            setDuplicateWarning(warning)
            setOverrideError(withReason ? result.error || null : null)
            return
          }
          showError(result.error || "Gagal menyimpan data")
          return
        }
        showSuccess(isEdit ? "Data berhasil diperbarui" : "Data berhasil ditambahkan")
        router.refresh()
      } catch (error) {
        if (error && typeof error === "object" && "digest" in error && String((error as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) throw error
        showError(error instanceof Error ? error.message : "Gagal menyimpan data")
      }
    })
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    // F-2026-10-25-030-S Q-LR-2: transisi baru ke lost wajib kategori
    // dari kamus tunggal; galat tampil verbatim pesan server bila lolos
    // klien tapi ditolak server (submitForm menampilkan result.error).
    if (isEdit && !isTerminalStatus && status === "lost") {
      if (!isLeadLostReasonCategoryKey(lostReasonCategory)) {
        showError("Kategori alasan kalah wajib dipilih saat lead diubah menjadi kalah (lost).")
        return
      }
      formData.set("lostReasonCategory", lostReasonCategory)
      if (lostReasonText.trim()) formData.set("lostReasonText", lostReasonText.trim())
    }
    submitForm(formData, null)
  }

  function onOverrideSubmit() {
    if (!duplicateWarning) return
    const reason = overrideReason.trim()
    if (reason.length < duplicateWarning.minReasonLength) {
      setOverrideError(
        reason
          ? `Alasan tetap membuat lead baru minimal ${duplicateWarning.minReasonLength} karakter.`
          : "Alasan tetap membuat lead baru wajib diisi.",
      )
      return
    }
    setOverrideError(null)
    submitForm(formRef.current ? new FormData(formRef.current) : new FormData(), reason)
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} aria-busy={isPending} aria-label={isEdit ? "Formulir ubah prospek" : "Formulir tambah prospek"} className="bg-surface rounded-xl border border-default shadow-sm p-4 sm:p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {isEdit && lead?.leadNumber && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="leadNumber">No. Lead</Label>
            <Input id="leadNumber" value={lead.leadNumber} readOnly className="bg-surface-secondary" />
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Nama <span className="text-destructive" aria-hidden="true">*</span></Label>
          <Input id="name" name="name" placeholder="Nama lead" required defaultValue={lead?.name || ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" placeholder="email@example.com" defaultValue={lead?.email || ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="phone">Telepon</Label>
          <Input id="phone" name="phone" type="tel" inputMode="numeric" placeholder="08xxxxxxxxxx" defaultValue={lead?.phone || ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="company">Perusahaan</Label>
          <Input id="company" name="company" placeholder="Nama perusahaan" defaultValue={lead?.company || ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="contactName">Nama Kontak</Label>
          <Input id="contactName" name="contactName" placeholder="Nama kontak person" defaultValue={lead?.contactName || ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="position">Jabatan</Label>
          <Input id="position" name="position" placeholder="Jabatan kontak" defaultValue={lead?.position || ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="industry">Industri</Label>
          <Input id="industry" name="industry" placeholder="Bidang industri" defaultValue={lead?.industry || ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="estimatedValue">Estimasi Nilai</Label>
          <CurrencyInput id="estimatedValue" name="estimatedValue" placeholder="0" defaultValue={lead?.estimatedValue} prefix="Rp" />
        </div>
        <div className="flex flex-col gap-1.5">
          <AppDatePicker
            label="Estimasi Tanggal Penutupan"
            name="expectedCloseDate"
            defaultValue={lead?.expectedCloseDate ? lead.expectedCloseDate.substring(0, 10) : undefined}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="source">Sumber</Label>
          <FormSelect
            id="source"
            name="source"
            value={source}
            onValueChange={setSource}
            placeholder="Pilih Sumber"
            options={[
              { value: "website", label: "Website" },
              { value: "referral", label: "Rujukan" },
              { value: "social_media", label: "Media Sosial" },
              { value: "cold_call", label: "Cold Call" },
              { value: "exhibition", label: "Pameran" },
              { value: "other", label: "Lainnya" },
            ]}
          />
        </div>
        {users.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="assignedTo">Ditugaskan Ke</Label>
            <Combobox
              id="assignedTo"
              name="assignedTo"
              options={users.map((u) => ({ value: String(u.id), label: u.name }))}
              value={assignedTo}
              onChange={setAssignedTo}
              placeholder="Cari user..."
            />
          </div>
        )}
        {isEdit && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="status">Status</Label>
            {isTerminalStatus ? (
              <>
                <Input value={statusLabel(lead?.status)} readOnly className="bg-surface-secondary" aria-label="Status" />
                <p className="text-xs text-muted-foreground">
                  Status {statusLabel(lead?.status)} bersifat final dan tidak dapat diubah.
                </p>
              </>
            ) : (
              <FormSelect
                id="status"
                name="status"
                value={status}
                onValueChange={setStatus}
                placeholder="Pilih Status"
                options={["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost"].map(
                  (s) => ({ value: s, label: statusLabel(s) }),
                )}
              />
            )}
          </div>
        )}
        {isEdit && !isTerminalStatus && status === "lost" && (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lostReasonCategory">
                Kategori alasan kalah <span className="text-destructive" aria-hidden="true">*</span>
              </Label>
              <FormSelect
                id="lostReasonCategory"
                value={lostReasonCategory}
                onValueChange={setLostReasonCategory}
                placeholder="Pilih kategori alasan"
                options={LEAD_LOST_REASON_CATEGORIES.map((c) => ({ value: c.key, label: c.label }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lostReasonText">Rincian alasan kalah (opsional)</Label>
              <Textarea
                id="lostReasonText"
                rows={2}
                maxLength={LEAD_LOST_REASON_FREE_TEXT_MAX}
                placeholder="Rincian alasan kalah (opsional)"
                value={lostReasonText}
                onChange={(e) => setLostReasonText(e.target.value)}
              />
            </div>
          </>
        )}
        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="address">Alamat</Label>
          <Textarea id="address" name="address" rows={2} placeholder="Alamat lengkap..." defaultValue={lead?.address || ""} />
        </div>
        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="notes">Catatan</Label>
          <Textarea id="notes" name="notes" rows={3} placeholder="Catatan tentang lead..." defaultValue={lead?.notes || ""} />
        </div>
      </div>
      {duplicateWarning && (
        <Alert variant="warning" className="mt-6">
          <AlertTriangle />
          <AlertTitle>{duplicateWarning.title}</AlertTitle>
          <AlertDescription className="w-full">
            <p>{duplicateWarning.body}</p>
            <ul className="mt-3 flex flex-col gap-2">
              {duplicateWarning.candidates.map((candidate) => (
                <DuplicateCandidateRow key={candidate.id} candidate={candidate} />
              ))}
            </ul>
            {duplicateWarning.lostCandidates.length > 0 && (
              <ul className="mt-2 flex flex-col gap-2">
                {duplicateWarning.lostCandidates.map((candidate) => (
                  <DuplicateCandidateRow key={candidate.id} candidate={candidate} />
                ))}
              </ul>
            )}
            <div className="mt-4 flex flex-col gap-1.5">
              <Label htmlFor="duplicateOverrideReason">
                Alasan tetap membuat lead baru (wajib, tercatat){" "}
                <span className="text-destructive" aria-hidden="true">*</span>
              </Label>
              <Textarea
                id="duplicateOverrideReason"
                rows={2}
                placeholder="Nomor sentral perusahaan, kontak orang berbeda"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                aria-required="true"
                aria-invalid={overrideError ? "true" : undefined}
                aria-describedby={overrideError ? "duplicateOverrideReason-error" : undefined}
              />
              {overrideError && (
                <p id="duplicateOverrideReason-error" role="alert" className="text-sm text-destructive">
                  {overrideError}
                </p>
              )}
              <div className="mt-1 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" className="w-full sm:w-auto" onPress={() => { setDuplicateWarning(null); setOverrideError(null) }}>
                  Batalkan
                </Button>
                <Button type="button" className="w-full sm:w-auto" isDisabled={isPending} onPress={onOverrideSubmit}>
                  {isPending ? "Menyimpan..." : "Tetap buat lead baru"}
                </Button>
              </div>
            </div>
          </AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3 mt-6 pt-5 border-t border-default">
        <Button type="button" className="w-full sm:w-auto" onPress={() => router.back()} >Batal</Button>
        <Button type="submit" className="w-full sm:w-auto" isDisabled={isPending} >{isPending ? "Menyimpan..." : isEdit ? "Perbarui" : "Simpan Lead"}</Button>
      </div>
    </form>
  )
}
