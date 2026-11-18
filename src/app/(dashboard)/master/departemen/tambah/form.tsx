"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { createDepartment } from "@/actions/master.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { runUiAction } from "@/components/ui/async-action"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { Label } from "@/components/ui/shadcn/label"
import { Button } from "@/components/ui/button"
import { FormActions } from "@/components/ui/form-section"

interface DepartmentCreateFormProps {
  generatedCode?: string
}

export function DepartmentCreateForm({ generatedCode }: DepartmentCreateFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      await runUiAction(async () => {
        const result = await createDepartment(formData)
        if (!result.success) {
          showError(result.error || "Gagal menyimpan data")
          return
        }
        showSuccess("Departemen berhasil ditambahkan")
        router.push("/master/departemen")
        router.refresh()
      }, "Gagal menyimpan data")
    })
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface rounded-xl border border-default shadow-sm p-4 sm:p-6">
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

      <FormActions>
        <Button className="w-full md:w-auto" type="button" onPress={() => router.back()} >Batal</Button>
        <Button className="w-full md:w-auto" type="submit" variant="primary" isDisabled={isPending} id="submit-department">
          {isPending ? "Menyimpan..." : "Simpan"}
        </Button>
      </FormActions>
    </form>
  )
}
