"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { updateItemGroup } from "@/actions/master.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input } from "@/components/ui/shadcn/input"
import { Label } from "@/components/ui/shadcn/label"
import { Button } from "@/components/ui/button"

interface ItemGroupFormProps {
  group: { id: number; code: string; name: string; description: string | null }
}

export function ItemGroupEditForm({ group }: ItemGroupFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      try {
        const result = await updateItemGroup(group.id, formData)
        if (result && !result.success) {
          showError(result.error || "Gagal menyimpan data")
          return
        }
        showSuccess("Grup barang berhasil diperbarui")
        router.push("/master/grup-barang")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan data")
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface rounded-xl border border-default shadow-sm p-4 sm:p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="code">Kode Grup</Label>
          <Input id="code" name="code" defaultValue={group.code} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Nama Grup *</Label>
          <Input id="name" name="name" defaultValue={group.name} required />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="description">Deskripsi</Label>
          <Input id="description" name="description" defaultValue={group.description ?? ""} />
        </div>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3 mt-6 pt-5 border-t border-default">
        <Button className="w-full sm:w-auto" type="button" onPress={() => router.back()}>
          Batal
        </Button>
        <Button className="w-full sm:w-auto" type="submit" variant="primary" isDisabled={isPending} id="submit-item-group-edit">
          {isPending ? "Menyimpan..." : "Simpan"}
        </Button>
      </div>
    </form>
  )
}
