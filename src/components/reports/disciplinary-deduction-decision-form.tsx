"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import { createDisciplinaryDeductionDecisionAction } from "@/actions/disciplinary-deduction.actions"
import {
  DISCIPLINARY_DEDUCTION_KINDS,
  SUSPENSION_KINDS,
  SUSPENSION_PAY_TREATMENTS,
} from "@/lib/reports/disciplinary-deduction"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { FormSelect } from "@/components/ui/form-select"
import { AppDatePicker } from "@/components/ui/date-picker"
import { CurrencyInput } from "@/components/ui/currency-input"
import { Button } from "@/components/ui/button"

export const DISC09_KIND_LABELS: Record<string, string> = {
  denda: "Denda",
  ganti_rugi: "Ganti Rugi",
}

export const DISC09_SUSPENSION_KIND_LABELS: Record<string, string> = {
  proses_phk: "Skorsing Proses PHK",
  disiplin: "Skorsing Disiplin",
}

export const DISC09_SUSPENSION_PAY_LABELS: Record<string, string> = {
  penuh: "Upah Penuh",
  proporsional: "Upah Proporsional",
  tidak_dibayar: "Upah Tidak Dibayar",
}

/**
 * BR-DISC-09: form pencatatan dokumen keputusan potongan disiplin.
 * Keputusan manusia tersendiri adalah satu-satunya pemicu potongan;
 * konteks SP opsional dan bukan pemicu. Guard bisnis (akun kompensasi
 * wajib untuk ganti rugi, snapshot skorsing, dsb.) ditegakkan service di
 * server — form menampilkan error server apa adanya tanpa duplikasi guard.
 * Nominal dikirim mentah ke action; UI tidak menghitung potongan apa pun.
 */
export function DisciplinaryDeductionDecisionForm({
  employees,
  records,
  accounts,
}: Readonly<{
  employees: { id: number; name: string }[]
  records: { id: number; employeeId: number; documentNo: string | null; label: string }[]
  accounts: { id: number; code: string; name: string }[]
}>) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [documentNo, setDocumentNo] = useState("")
  const [decidedAt, setDecidedAt] = useState("")
  const [employeeId, setEmployeeId] = useState("")
  const [recordId, setRecordId] = useState("")
  const [kind, setKind] = useState("denda")
  const [amount, setAmount] = useState(0)
  const [compensationAccountId, setCompensationAccountId] = useState("")
  const [suspensionKind, setSuspensionKind] = useState("")
  const [suspensionPayTreatment, setSuspensionPayTreatment] = useState("")
  const [regulationReference, setRegulationReference] = useState("")
  const [signedBy, setSignedBy] = useState("")

  // Konteks SP hanya dari karyawan terpilih; server tetap memverifikasi
  // kepemilikan SP terhadap employeeId yang sama.
  const visibleRecords = records.filter((r) => String(r.employeeId) === employeeId)

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      const result = await createDisciplinaryDeductionDecisionAction({
        documentNo: documentNo.trim(),
        decidedAt,
        employeeId: Number(employeeId),
        disciplinaryRecordId: recordId ? Number(recordId) : null,
        kind,
        amount,
        compensationAccountId: compensationAccountId ? Number(compensationAccountId) : null,
        suspensionKind: suspensionKind || null,
        suspensionPayTreatment: suspensionKind ? suspensionPayTreatment || null : null,
        regulationReference: regulationReference.trim() || null,
        signedBy: Number(signedBy),
      })
      if (!result.success) {
        showError(result.error)
        return
      }
      showSuccess("Dokumen keputusan potongan disiplin tersimpan")
      router.push("/sdm/disiplin")
      router.refresh()
    })
  }

  return (
    <form
      onSubmit={onSubmit}
      aria-busy={isPending}
      aria-label="Formulir pencatatan keputusan potongan disiplin"
      className="bg-surface rounded-xl border border-default shadow-sm p-6"
    >
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="documentNo">
            Nomor Dokumen Keputusan <span className="text-destructive" aria-hidden="true">*</span>
          </Label>
          <Input
            id="documentNo"
            value={documentNo}
            onChange={(e) => setDocumentNo(e.target.value)}
            required
            placeholder="Contoh: KEP/HRD/2026/010"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <AppDatePicker
            label="Tanggal Keputusan *"
            name="decidedAt"
            value={decidedAt}
            onChange={setDecidedAt}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="employeeId">
            Karyawan <span className="text-destructive" aria-hidden="true">*</span>
          </Label>
          <FormSelect
            id="employeeId"
            required
            value={employeeId}
            onValueChange={(v) => {
              setEmployeeId(v)
              setRecordId("")
            }}
            placeholder="Pilih karyawan"
            options={employees.map((e) => ({ value: String(e.id), label: e.name }))}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="disciplinaryRecordId">Konteks Surat Peringatan (opsional)</Label>
          <FormSelect
            id="disciplinaryRecordId"
            value={recordId}
            onValueChange={setRecordId}
            placeholder={employeeId ? "Tanpa konteks SP" : "Pilih karyawan dulu"}
            disabled={!employeeId}
            options={visibleRecords.map((r) => ({ value: String(r.id), label: r.label }))}
          />
          <p className="text-xs text-muted-foreground">
            Konteks saja — surat peringatan tidak memicu potongan; keputusan ini yang menjadi dasar
            potongan.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="kind">
            Jenis Potongan <span className="text-destructive" aria-hidden="true">*</span>
          </Label>
          <FormSelect
            id="kind"
            required
            value={kind}
            onValueChange={setKind}
            options={DISCIPLINARY_DEDUCTION_KINDS.map((k) => ({
              value: k,
              label: DISC09_KIND_LABELS[k],
            }))}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="amount">
            Nominal Keputusan (Rp) <span className="text-destructive" aria-hidden="true">*</span>
          </Label>
          <CurrencyInput
            id="amount"
            value={amount}
            onChange={setAmount}
            required
            placeholder="0"
          />
          <p className="text-xs text-muted-foreground">
            Nominal adalah snapshot dokumen keputusan; penerapan ke periode payroll dilakukan proses
            payroll tersendiri, bukan dari form ini.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="compensationAccountId">Akun Kompensasi</Label>
          <FormSelect
            id="compensationAccountId"
            value={compensationAccountId}
            onValueChange={setCompensationAccountId}
            placeholder="Pilih akun kompensasi"
            options={accounts.map((a) => ({
              value: String(a.id),
              label: `${a.code} — ${a.name}`,
            }))}
          />
          <p className="text-xs text-muted-foreground">
            Wajib untuk keputusan ganti rugi; akun pendapatan denda 710006 bukan akun kompensasi.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="signedBy">
            Ditandatangani Oleh <span className="text-destructive" aria-hidden="true">*</span>
          </Label>
          <FormSelect
            id="signedBy"
            required
            value={signedBy}
            onValueChange={setSignedBy}
            placeholder="Pilih pejabat penandatangan"
            options={employees.map((e) => ({ value: String(e.id), label: e.name }))}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="suspensionKind">Jenis Skorsing (opsional)</Label>
          <FormSelect
            id="suspensionKind"
            value={suspensionKind}
            onValueChange={(v) => {
              setSuspensionKind(v)
              if (!v) setSuspensionPayTreatment("")
            }}
            placeholder="Tanpa skorsing"
            options={SUSPENSION_KINDS.map((k) => ({
              value: k,
              label: DISC09_SUSPENSION_KIND_LABELS[k],
            }))}
          />
        </div>
        {suspensionKind ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="suspensionPayTreatment">
              Perlakuan Upah Skorsing <span className="text-destructive" aria-hidden="true">*</span>
            </Label>
            <FormSelect
              id="suspensionPayTreatment"
              required
              value={suspensionPayTreatment}
              onValueChange={setSuspensionPayTreatment}
              placeholder="Pilih perlakuan upah"
              options={SUSPENSION_PAY_TREATMENTS.map((t) => ({
                value: t,
                label: DISC09_SUSPENSION_PAY_LABELS[t],
              }))}
            />
          </div>
        ) : null}
        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="regulationReference">Dasar Peraturan (PK/PP/PKB)</Label>
          <Textarea
            id="regulationReference"
            rows={2}
            value={regulationReference}
            onChange={(e) => setRegulationReference(e.target.value)}
            placeholder="Contoh: Peraturan Perusahaan Bab IV Pasal 20"
          />
          <p className="text-xs text-muted-foreground">
            Wajib menyebut klausul PK/PP/PKB bila keputusan memuat skorsing disiplin.
          </p>
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-3 border-t border-default pt-5">
        <Button type="button" onPress={() => router.back()}>
          Batal
        </Button>
        <Button type="submit" isDisabled={isPending}>
          {isPending ? "Menyimpan..." : "Simpan Keputusan"}
        </Button>
      </div>
    </form>
  )
}
