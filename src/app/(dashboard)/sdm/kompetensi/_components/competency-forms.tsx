"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import {
  assessEmployeeCompetency,
  createCompetency,
  setPositionCompetency,
} from "@/actions/development.actions"
import { showError, showSuccess } from "@/lib/utils/toast"

function submit(
  router: ReturnType<typeof useRouter>,
  startTransition: (fn: () => void) => void,
  form: HTMLFormElement,
  fn: (fd: FormData) => Promise<{ success: boolean; error?: string }>,
  okMessage: string,
) {
  const formData = new FormData(form)
  startTransition(() => {
    void (async () => {
      try {
        const result = await fn(formData)
        if (!result?.success) throw new Error(result?.error || "Gagal menyimpan")
        showSuccess(okMessage)
        form.reset()
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan")
      }
    })()
  })
}

export function CompetencyForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  return (
    <form
      aria-busy={isPending}
      className="grid grid-cols-1 sm:grid-cols-4 gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        submit(router, startTransition, e.currentTarget, createCompetency, "Kompetensi dibuat")
      }}
    >
      <input name="name" id="competency-name" required placeholder="Nama kompetensi" aria-label="Nama kompetensi" className="form-input" />
      <input name="category" id="competency-category" placeholder="Kategori (Teknis/Perilaku/Kepemimpinan)" aria-label="Kategori kompetensi" className="form-input" />
      <input name="description" id="competency-description" placeholder="Deskripsi" aria-label="Deskripsi kompetensi" className="form-input" />
      <button type="submit" disabled={isPending} className="btn-primary px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
        Tambah Kompetensi
      </button>
    </form>
  )
}

export function PositionCompetencyForm({
  positions,
  competencies,
}: {
  positions: { id: number; name: string }[]
  competencies: { id: number; name: string }[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  return (
    <form
      aria-busy={isPending}
      className="grid grid-cols-1 sm:grid-cols-4 gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        submit(router, startTransition, e.currentTarget, setPositionCompetency, "Syarat jabatan disimpan")
      }}
    >
      <select name="positionId" id="position-requirement-position" required aria-label="Jabatan" className="form-input" defaultValue="">
        <option value="" disabled>Jabatan</option>
        {positions.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
      <select name="competencyId" id="position-requirement-competency" required aria-label="Kompetensi" className="form-input" defaultValue="">
        <option value="" disabled>Kompetensi</option>
        {competencies.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <input name="requiredLevel" id="position-requirement-level" type="number" min={1} max={5} required placeholder="Level syarat (1-5)" aria-label="Level syarat (1-5)" className="form-input" />
      <button type="submit" disabled={isPending} className="btn-secondary px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
        Tetapkan Syarat
      </button>
    </form>
  )
}

export function EmployeeCompetencyForm({
  employees,
  competencies,
}: {
  employees: { id: number; name: string }[]
  competencies: { id: number; name: string }[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  return (
    <form
      aria-busy={isPending}
      className="grid grid-cols-1 sm:grid-cols-4 gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        submit(router, startTransition, e.currentTarget, assessEmployeeCompetency, "Penilaian kompetensi disimpan")
      }}
    >
      <select name="employeeId" id="employee-assessment-employee" required aria-label="Karyawan" className="form-input" defaultValue="">
        <option value="" disabled>Karyawan</option>
        {employees.map((e) => (
          <option key={e.id} value={e.id}>{e.name}</option>
        ))}
      </select>
      <select name="competencyId" id="employee-assessment-competency" required aria-label="Kompetensi" className="form-input" defaultValue="">
        <option value="" disabled>Kompetensi</option>
        {competencies.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <input name="level" id="employee-assessment-level" type="number" min={1} max={5} required placeholder="Level aktual (1-5)" aria-label="Level aktual (1-5)" className="form-input" />
      <button type="submit" disabled={isPending} className="btn-secondary px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
        Nilai Karyawan
      </button>
    </form>
  )
}
