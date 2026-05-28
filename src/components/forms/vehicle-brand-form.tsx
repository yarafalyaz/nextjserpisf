"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { createVehicleBrand, updateVehicleBrand } from "@/actions/vehicle.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input, Label } from "@heroui/react"
import { Button } from "@/components/ui/page-header"

export function VehicleBrandForm({ brand }: { brand?: { id: number; name: string } } = {}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget)
        brand?.id ? await updateVehicleBrand(brand.id, formData) : await createVehicleBrand(formData)
        showSuccess(brand?.id ? "Data berhasil diupdate" : "Data berhasil ditambahkan")
        router.push("/kendaraan/merek")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan data")
      }
    })
  }

  return (
    <form onSubmit={onSubmit} className="bg-surface rounded-xl border border-default shadow-sm p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Nama Merek *</Label>
          <Input id="name" name="name" required placeholder="Contoh: Toyota" defaultValue={brand?.name ?? ""} />
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <Button type="button" onPress={() => router.back()} >Batal</Button>
        <Button type="submit" isDisabled={isPending} >{isPending ? "Menyimpan..." : brand?.id ? "Update" : "Simpan"}</Button>
      </div>
    </form>
  )
}
