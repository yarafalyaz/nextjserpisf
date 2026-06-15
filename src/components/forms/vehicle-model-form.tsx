"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { createVehicleModel, updateVehicleModel } from "@/actions/vehicle.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Combobox } from "@/components/ui/combobox"
import { Button } from "@/components/ui/button"

interface VehicleModelFormProps {
  brands: { id: number; name: string
}[]
  model?: { id: number; name: string; brandId?: number; vehicleBrandId?: number }
}

export function VehicleModelForm({ brands, model }: VehicleModelFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [brandId, setBrandId] = useState<string | null>(
    model?.brandId || model?.vehicleBrandId ? String(model.brandId ?? model.vehicleBrandId) : null
  )

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget)
        const result = model?.id ? await updateVehicleModel(model.id, formData) : await createVehicleModel(formData)
        if (result && !result.success) { showError(result.error || "Gagal menyimpan data"); return }
        showSuccess(model?.id ? "Data berhasil diperbarui" : "Data berhasil ditambahkan")
        router.push("/kendaraan/model")
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
          <Label htmlFor="brandId">Merek Kendaraan *</Label>
          <Combobox
            id="brandId"
            name="brandId"
            options={brands.map((b) => ({ value: String(b.id), label: b.name }))}
            value={brandId}
            onChange={setBrandId}
            placeholder="Cari merek..."
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Nama Model *</Label>
          <Input id="name" name="name" required placeholder="Contoh: Avanza" defaultValue={model?.name ?? ""} />
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <Button type="button" onPress={() => router.back()}>Batal</Button>
        <Button type="submit" variant="primary" isDisabled={isPending}>{isPending ? "Menyimpan..." : model?.id ? "Perbarui" : "Simpan"}</Button>
      </div>
    </form>
  )
}
