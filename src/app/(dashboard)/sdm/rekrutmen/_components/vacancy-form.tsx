"use client"

import { useRouter } from "next/navigation"
import { useRef, useTransition } from "react"
import { createVacancy, updateVacancy } from "@/actions/recruitment.actions"
import { showError, showSuccess } from "@/lib/utils/toast"
import { Input } from "@/components/ui/shadcn/input"
import { Label } from "@/components/ui/shadcn/label"
import { Textarea } from "@/components/ui/shadcn/textarea"

const selectClass =
  "h-11 w-full rounded-md border border-input bg-transparent px-3 text-base md:h-9 md:text-sm"

interface VacancyFormProps {
  vacancy?: {
    id: number
    title: string
    departmentId: number | null
    positionId: number | null
    description: string | null
    requirements: string | null
    location: string | null
    employmentType: string | null
    quota: number
  }
  departments: { id: number; name: string }[]
  positions: { id: number; name: string }[]
}

export function VacancyForm({ vacancy, departments, positions }: VacancyFormProps) {
  const router = useRouter()
  // Idempotency: key stabil per intent tambah; retry jaringan memakai key
  // yang sama (ditolak server). Sukses bernavigasi pergi, tak perlu rotasi.
  const idempotencyKeyRef = useRef<string | null>(null)
  if (idempotencyKeyRef.current === null) idempotencyKeyRef.current = crypto.randomUUID()
  const [isPending, startTransition] = useTransition()
  const isEdit = !!vacancy

  function onSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    if (!isEdit) formData.set("idempotencyKey", idempotencyKeyRef.current!)
    startTransition(async () => {
      try {
        const result = isEdit
          ? await updateVacancy(vacancy!.id, formData)
          : await createVacancy(formData)
        if (!result?.success) throw new Error(result?.error || "Gagal menyimpan lowongan")
        showSuccess(isEdit ? "Lowongan diperbarui" : "Lowongan dibuat")
        router.push("/sdm/rekrutmen")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan lowongan")
      }
    })
  }

  return (
    <form onSubmit={onSubmit} aria-busy={isPending} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="title">Judul Lowongan *</Label>
        <Input id="title" name="title" required defaultValue={vacancy?.title ?? ""} placeholder="cth. Welder Produksi" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="departmentId">Departemen</Label>
          <select id="departmentId" name="departmentId" defaultValue={vacancy?.departmentId ?? ""} className={selectClass}>
            <option value="">-- Pilih Departemen --</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="positionId">Jabatan</Label>
          <select id="positionId" name="positionId" defaultValue={vacancy?.positionId ?? ""} className={selectClass}>
            <option value="">-- Pilih Jabatan --</option>
            {positions.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="location">Lokasi</Label>
          <Input id="location" name="location" defaultValue={vacancy?.location ?? ""} placeholder="cth. Pabrik Cikarang" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="employmentType">Jenis Kepegawaian</Label>
          <Input id="employmentType" name="employmentType" defaultValue={vacancy?.employmentType ?? ""} placeholder="cth. PKWTT / PKWT" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="quota">Kuota</Label>
          <Input id="quota" name="quota" type="number" min={1} max={999} defaultValue={vacancy?.quota ?? 1} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="description">Deskripsi</Label>
        <Textarea id="description" name="description" rows={4} defaultValue={vacancy?.description ?? ""} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="requirements">Persyaratan</Label>
        <Textarea id="requirements" name="requirements" rows={4} defaultValue={vacancy?.requirements ?? ""} />
      </div>
      <div>
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center justify-center min-h-11 sm:min-h-9 px-4 py-2 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
        >
          {isPending ? "Menyimpan..." : isEdit ? "Simpan Perubahan" : "Buat Lowongan"}
        </button>
      </div>
    </form>
  )
}
