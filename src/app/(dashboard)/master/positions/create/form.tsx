"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { createPosition, updatePosition } from "@/actions/master.actions"

interface PositionCreateFormProps {
  departments: { id: number; name: string }[]
  position?: { id: number; name: string; departmentId: number | null; code?: string | null }
  generatedCode?: string
}

export function PositionCreateForm({ departments, position, generatedCode }: PositionCreateFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const isEdit = !!position

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      if (isEdit) {
        await updatePosition(position!.id, formData)
      } else {
        await createPosition(formData)
      }
      router.push("/master/positions")
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface rounded-xl border border-default shadow-sm p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="code" className="text-sm font-medium text-foreground">Kode Jabatan</label>
          <input id="code" name="code" className="form-input bg-muted" readOnly defaultValue={position?.code || generatedCode || ""} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="name" className="text-sm font-medium text-foreground">Nama Jabatan *</label>
          <input id="name" name="name" className="form-input" placeholder="Nama jabatan" required defaultValue={position?.name || ""} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="departmentId" className="text-sm font-medium text-foreground">Departemen</label>
          <select id="departmentId" name="departmentId" className="form-input" defaultValue={position?.departmentId || ""}>
            <option value="">Pilih Departemen</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <button type="button" onClick={() => router.back()} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all">Batal</button>
        <button type="submit" disabled={isPending} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="submit-position">
          {isPending ? "Menyimpan..." : isEdit ? "Update" : "Simpan"}
        </button>
      </div>
    </form>
  )
}
