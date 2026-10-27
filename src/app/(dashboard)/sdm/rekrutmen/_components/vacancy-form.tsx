"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { createVacancy, updateVacancy } from "@/actions/recruitment.actions"
import { showError, showSuccess } from "@/lib/utils/toast"

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
  const [isPending, startTransition] = useTransition()
  const isEdit = !!vacancy

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
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
        <label htmlFor="title" className="text-sm font-medium">Judul Lowongan *</label>
        <input id="title" name="title" required defaultValue={vacancy?.title ?? ""} className="form-input" placeholder="cth. Welder Produksi" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="departmentId" className="text-sm font-medium">Departemen</label>
          <select id="departmentId" name="departmentId" defaultValue={vacancy?.departmentId ?? ""} className="form-input">
            <option value="">— Pilih —</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="positionId" className="text-sm font-medium">Jabatan</label>
          <select id="positionId" name="positionId" defaultValue={vacancy?.positionId ?? ""} className="form-input">
            <option value="">— Pilih —</option>
            {positions.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="location" className="text-sm font-medium">Lokasi</label>
          <input id="location" name="location" defaultValue={vacancy?.location ?? ""} className="form-input" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="employmentType" className="text-sm font-medium">Jenis Kepegawaian</label>
          <input id="employmentType" name="employmentType" defaultValue={vacancy?.employmentType ?? ""} className="form-input" placeholder="cth. PKWTT / PKWT" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="quota" className="text-sm font-medium">Kuota</label>
          <input id="quota" name="quota" type="number" min={1} max={999} defaultValue={vacancy?.quota ?? 1} className="form-input" />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="description" className="text-sm font-medium">Deskripsi</label>
        <textarea id="description" name="description" rows={4} defaultValue={vacancy?.description ?? ""} className="form-input" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="requirements" className="text-sm font-medium">Persyaratan</label>
        <textarea id="requirements" name="requirements" rows={4} defaultValue={vacancy?.requirements ?? ""} className="form-input" />
      </div>
      <div>
        <button type="submit" disabled={isPending} className="btn-primary px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
          {isPending ? "Menyimpan..." : isEdit ? "Simpan Perubahan" : "Buat Lowongan"}
        </button>
      </div>
    </form>
  )
}
