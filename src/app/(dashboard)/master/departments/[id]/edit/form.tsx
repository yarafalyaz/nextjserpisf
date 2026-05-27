"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { updateDepartment } from "@/actions/master.actions"
import { Input, TextArea, Label } from "@heroui/react"
import { Button } from "@/components/ui/page-header"

interface EditDepartmentFormProps {
  department: {
    id: number
    name: string
    code: string | null
    description: string | null
  }
}

export function EditDepartmentForm({ department }: EditDepartmentFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      await updateDepartment(department.id, formData)
      router.push("/master/departments")
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface rounded-xl border border-default shadow-sm p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="code">Kode</Label>
          <Input id="code" name="code" placeholder="Contoh: DEPT-01" defaultValue={department.code || ""} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Nama *</Label>
          <Input id="name" name="name" placeholder="Nama departemen" required defaultValue={department.name} />
        </div>

        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="description">Deskripsi</Label>
          <TextArea id="description" name="description" rows={3} placeholder="Deskripsi departemen" defaultValue={department.description || ""} />
        </div>
      </div>

      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <Button onClick={() => router.back()} >Batal</Button>
        <Button type="submit" variant="primary" disabled={isPending} id="submit-department">
          {isPending ? "Menyimpan..." : "Update"}
        </Button>
      </div>
    </form>
  )
}
