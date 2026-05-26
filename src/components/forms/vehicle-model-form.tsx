// @ts-nocheck
"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { createVehicleModel, updateVehicleModel } from "@/actions/vehicle.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input, ComboBox, ListBox, Label } from "@heroui/react"

interface VehicleModelFormProps {
  brands: { id: number; name: string
}[]
  model?: any
}

export function VehicleModelForm({ brands, model }: VehicleModelFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget)
        model?.id ? await updateVehicleModel(model.id, formData) : await createVehicleModel(formData)
        showSuccess(model?.id ? "Data berhasil diupdate" : "Data berhasil ditambahkan")
        router.push("/vehicles/models")
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
          <ComboBox name="brandId" className="w-full" isRequired>
            <Label>Merek Kendaraan *</Label>
            <ComboBox.InputGroup><Input placeholder="Cari merek..." /><ComboBox.Trigger /></ComboBox.InputGroup>
            <ComboBox.Popover>
              <ListBox>
                {brands.map((b) => (
                  <ListBox.Item key={b.id} id={String(b.id)} textValue={b.name}>{b.name}</ListBox.Item>
                ))}
              </ListBox>
            </ComboBox.Popover>
          </ComboBox>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Nama Model *</Label>
          <Input id="name" name="name" required placeholder="Contoh: Avanza" defaultValue={model?.name ?? ""} />
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <button type="button" onClick={() => router.back()} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all">Batal</button>
        <button type="submit" disabled={isPending} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">{isPending ? "Menyimpan..." : model?.id ? "Update" : "Simpan"}</button>
      </div>
    </form>
  )
}
