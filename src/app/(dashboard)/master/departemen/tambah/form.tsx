"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { createDepartment } from "@/actions/master.actions"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { Label } from "@/components/ui/shadcn/label"
import { Button } from "@/components/ui/page-header"

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
      router.push("/master/departemen")
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
          <Textarea id="description" name="description" rows={3} placeholder="Deskripsi departemen" />
        </div>
      </div>

      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <Button type="button" onPress={() => router.back()} >Batal</Button>
        <Button type="submit" variant="primary" isDisabled={isPending} id="submit-department">
          {isPending ? "Menyimpan..." : "Simpan"}
        </Button>
      </div>
    </form>
  )
}
