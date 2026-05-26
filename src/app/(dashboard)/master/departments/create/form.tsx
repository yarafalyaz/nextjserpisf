"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { createDepartment } from "@/actions/master.actions"
import { Input, TextArea, Label } from "@heroui/react"

interface DepartmentCreateFormProps {
  generatedCode?: string
}

export function DepartmentCreateForm({ generatedCode }: DepartmentCreateFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      await createDepartment(formData)
      router.push("/master/departments")
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface rounded-xl border border-default shadow-sm p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="code">Kode</Label>
          <Input id="code" name="code" defaultValue={generatedCode || ""} readOnly className="bg-muted" />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Nama *</Label>
          <Input id="name" name="name" placeholder="Nama departemen" required />
        </div>

        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="description">Deskripsi</Label>
          <TextArea id="description" name="description" rows={3} placeholder="Deskripsi departemen" />
        </div>
      </div>

      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <button type="button" onClick={() => router.back()} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all">Batal</button>
        <button type="submit" disabled={isPending} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="submit-department">
          {isPending ? "Menyimpan..." : "Simpan"}
        </button>
      </div>
    </form>
  )
}
