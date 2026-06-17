"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { createPosition, updatePosition } from "@/actions/master.actions"
import { Input } from "@/components/ui/shadcn/input"
import { Label } from "@/components/ui/shadcn/label"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { FormSelect } from "@/components/ui/form-select"
import { Button } from "@/components/ui/button"

interface PositionCreateFormProps {
  departments: { id: number; name: string }[]
  position?: { id: number; name: string; departmentId: number | null; code?: string | null; description?: string | null }
  generatedCode?: string
}

export function PositionCreateForm({ departments, position, generatedCode }: PositionCreateFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const isEdit = !!position

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    if (!isEdit) formData.delete("code")
    startTransition(async () => {
      if (isEdit) {
        await updatePosition(position!.id, formData)
      } else {
        await createPosition(formData)
      }
      router.push("/master/jabatan")
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface rounded-xl border border-default shadow-sm p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="code">Kode Jabatan</Label>
          <Input id="code" name="code" className="bg-muted" readOnly defaultValue={position?.code || generatedCode || ""} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Nama Jabatan *</Label>
          <Input id="name" name="name" placeholder="Nama jabatan" required defaultValue={position?.name || ""} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="departmentId">Departemen</Label>
          <FormSelect
            id="departmentId"
            name="departmentId"
            defaultValue={position?.departmentId ? String(position.departmentId) : undefined}
            placeholder="Pilih Departemen"
            options={departments.map((d) => ({ value: String(d.id), label: d.name }))}
          />
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="description">Deskripsi</Label>
          <Textarea id="description" name="description" rows={3} placeholder="Deskripsi jabatan (opsional)" defaultValue={position?.description || ""} />
        </div>
      </div>

      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <Button type="button" onPress={() => router.back()} >Batal</Button>
        <Button type="submit" variant="primary" isDisabled={isPending} id="submit-position">
          {isPending ? "Menyimpan..." : isEdit ? "Perbarui" : "Simpan"}
        </Button>
      </div>
    </form>
  )
}
