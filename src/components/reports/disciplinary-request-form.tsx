"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import { createDisciplinaryRecord } from "@/actions/disciplinary.actions"
import { isDisciplinarySevereCategory } from "@/lib/reports/disciplinary"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { FormSelect } from "@/components/ui/form-select"
import { AppDatePicker } from "@/components/ui/date-picker"
import { Button } from "@/components/ui/button"

/**
 * DISC-F1: form pengajuan surat peringatan. Jenjang TIDAK dipilih bebas —
 * jenjang dirender dari konstanta level dan server menghitung ulang jenjang
 * sah dari rekod issued aktif pada tanggal kejadian (BR-DISC-04). Opsi SP
 * pertama dan terakhir hanya tampil bila kategori terpilih masuk daftar
 * berat Q-DISC-1 (isDisciplinarySevereCategory dari builder, AC-DISC-9).
 * Tanpa field gaji apa pun (BR-DISC-08).
 */
export function DisciplinaryRequestForm({
  employees,
  levels,
  categories,
}: Readonly<{
  employees: { id: number; name: string }[]
  levels: { value: string; label: string }[]
  categories: readonly string[]
}>) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [employeeId, setEmployeeId] = useState("")
  const [category, setCategory] = useState("")
  const [level, setLevel] = useState("sp1")
  const [violationDate, setViolationDate] = useState("")
  const [description, setDescription] = useState("")
  const [regulationReference, setRegulationReference] = useState("")

  const severe = isDisciplinarySevereCategory(category)
  const visibleLevels = levels.filter((l) => severe || l.value !== "sp_first_final")

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      const result = await createDisciplinaryRecord({
        employeeId: Number(employeeId),
        level,
        violationCategory: category,
        violationDate,
        description,
        regulationReference: regulationReference.trim() || null,
      })
      if (!result.success) {
        showError(result.error)
        return
      }
      showSuccess("Pengajuan surat peringatan tersimpan sebagai draft")
      router.push("/sdm/disiplin")
      router.refresh()
    })
  }

  return (
    <form
      onSubmit={onSubmit}
      aria-busy={isPending}
      aria-label="Formulir pengajuan surat peringatan"
      className="bg-surface rounded-xl border border-default shadow-sm p-6"
    >
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="employeeId">
            Karyawan <span className="text-destructive" aria-hidden="true">*</span>
          </Label>
          <FormSelect
            id="employeeId"
            required
            value={employeeId}
            onValueChange={setEmployeeId}
            placeholder="Pilih karyawan"
            options={employees.map((e) => ({ value: String(e.id), label: e.name }))}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <AppDatePicker
            label="Tanggal Kejadian *"
            name="violationDate"
            value={violationDate}
            onChange={setViolationDate}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="violationCategory">
            Kategori Pelanggaran <span className="text-destructive" aria-hidden="true">*</span>
          </Label>
          <FormSelect
            id="violationCategory"
            required
            value={category}
            onValueChange={(v) => {
              setCategory(v)
              // Kategori berubah ke non-berat: opsi first-final hilang dari
              // daftar; kembalikan pilihan ke SP1 supaya tidak terkirim.
              if (!isDisciplinarySevereCategory(v) && level === "sp_first_final") {
                setLevel("sp1")
              }
            }}
            placeholder="Pilih kategori pelanggaran"
            options={categories.map((c) => ({ value: c, label: c }))}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="level">
            Jenjang Peringatan <span className="text-destructive" aria-hidden="true">*</span>
          </Label>
          <FormSelect
            id="level"
            required
            value={level}
            onValueChange={setLevel}
            options={visibleLevels}
          />
          <p className="text-xs text-muted-foreground">
            Jenjang dihitung ulang server dari SP aktif pada tanggal kejadian; pilihan yang
            melewati urutan ditolak.
          </p>
        </div>
        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="description">
            Uraian Pelanggaran <span className="text-destructive" aria-hidden="true">*</span>
          </Label>
          <Textarea
            id="description"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            placeholder="Uraian kejadian pelanggaran..."
          />
        </div>
        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="regulationReference">Dasar Peraturan yang Dilanggar</Label>
          <Textarea
            id="regulationReference"
            rows={2}
            value={regulationReference}
            onChange={(e) => setRegulationReference(e.target.value)}
            placeholder="Contoh: Peraturan Perusahaan Bab III Pasal 12"
          />
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-3 border-t border-default pt-5">
        <Button type="button" onPress={() => router.back()}>
          Batal
        </Button>
        <Button type="submit" isDisabled={isPending}>
          {isPending ? "Menyimpan..." : "Simpan Pengajuan"}
        </Button>
      </div>
    </form>
  )
}
