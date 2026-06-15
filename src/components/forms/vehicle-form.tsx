"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition, useMemo } from "react"
import { createVehicle, updateVehicle } from "@/actions/vehicle.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { Combobox } from "@/components/ui/combobox"
import { Button } from "@/components/ui/button"

interface Variant {
  id: number
  name: string
  vehicleModelId: number
  drivetrain: string | null
  transmission: string | null
}

interface VehicleFormProps {
  brands: { id: number; name: string }[]
  models: { id: number; name: string; vehicleBrandId: number }[]
  variants: Variant[]
  customers: { id: number; name: string }[]
  vehicle?: {
    id: number
    plateNumber: string
    plateNo?: string
    brandId?: number | null
    modelId?: number | null
    variantId?: number | null
    year?: number | null
    color?: string | null
    customerId?: number | null
    notes?: string | null
  }
}

export function VehicleForm({ brands, models, variants, customers, vehicle }: VehicleFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Resolve initial values: derive brandId from variant→model→brand if needed
  const initialVariant = vehicle?.variantId ? variants.find((v) => v.id === vehicle.variantId) : null
  const initialModel = (vehicle?.modelId
    ? models.find((m) => m.id === vehicle.modelId)
    : initialVariant
      ? models.find((m) => m.id === initialVariant.vehicleModelId)
      : null) ?? null
  const initialBrandId = vehicle?.brandId ?? initialModel?.vehicleBrandId ?? null

  const [brandId, setBrandId] = useState<string | null>(initialBrandId ? String(initialBrandId) : null)
  const [modelId, setModelId] = useState<string | null>(
    vehicle?.modelId ? String(vehicle.modelId) : initialVariant ? String(initialVariant.vehicleModelId) : null
  )
  const [variantId, setVariantId] = useState<string | null>(
    vehicle?.variantId ? String(vehicle.variantId) : null
  )
  const [customerId, setCustomerId] = useState<string | null>(vehicle?.customerId ? String(vehicle.customerId) : null)

  // Cascade filters
  const filteredModels = useMemo(
    () => (brandId ? models.filter((m) => m.vehicleBrandId === Number(brandId)) : models),
    [brandId, models]
  )
  const filteredVariants = useMemo(
    () => (modelId ? variants.filter((v) => v.vehicleModelId === Number(modelId)) : []),
    [modelId, variants]
  )

  function handleBrandChange(v: string | null) {
    setBrandId(v)
    // Reset model & variant when brand changes
    setModelId(null)
    setVariantId(null)
  }
  function handleModelChange(v: string | null) {
    setModelId(v)
    // Reset variant when model changes
    setVariantId(null)
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget)
        // Ensure variantId is in formData (Combobox renders hidden input via name prop)
        const result = vehicle?.id ? await updateVehicle(vehicle.id, formData) : await createVehicle(formData)
        if (result && !result.success) {
          showError(result.error || "Gagal menyimpan data")
          return
        }
        showSuccess(vehicle?.id ? "Data berhasil diperbarui" : "Data berhasil ditambahkan")
        router.push("/kendaraan")
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
          <Label htmlFor="plateNo">No. Plat *</Label>
          <Input id="plateNo" name="plateNo" placeholder="B 1234 ABC" required defaultValue={vehicle?.plateNo ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="brandId">Merek</Label>
          <Combobox
            id="brandId"
            name="brandId"
            options={brands.map((b) => ({ value: String(b.id), label: b.name }))}
            value={brandId}
            onChange={handleBrandChange}
            placeholder="Cari merek..."
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="modelId">Model</Label>
          <Combobox
            id="modelId"
            name="modelId"
            options={filteredModels.map((m) => ({ value: String(m.id), label: m.name }))}
            value={modelId}
            onChange={handleModelChange}
            placeholder={brandId ? "Cari model..." : "Pilih merek dulu"}
            disabled={!brandId}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="variantId">Tipe / Varian</Label>
          <Combobox
            id="variantId"
            name="variantId"
            options={filteredVariants.map((v) => {
              const tags = [v.drivetrain, v.transmission].filter(Boolean).join(" • ")
              return { value: String(v.id), label: tags ? `${v.name} (${tags})` : v.name }
            })}
            value={variantId}
            onChange={setVariantId}
            placeholder={modelId ? "Cari tipe/varian..." : "Pilih model dulu"}
            disabled={!modelId}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="customerId">Pelanggan</Label>
          <Combobox
            id="customerId"
            name="customerId"
            options={customers.map((c) => ({ value: String(c.id), label: c.name }))}
            value={customerId}
            onChange={setCustomerId}
            placeholder="Cari pelanggan..."
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="year">Tahun</Label>
          <Input id="year" name="year" type="number" placeholder="2024" min={1900} max={2100} defaultValue={vehicle?.year ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="color">Warna</Label>
          <Input id="color" name="color" placeholder="Hitam" defaultValue={vehicle?.color ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="notes">Catatan</Label>
          <Textarea id="notes" name="notes" rows={3} placeholder="Catatan kendaraan..." defaultValue={vehicle?.notes ?? ""} />
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <Button type="button" onPress={() => router.back()}>Batal</Button>
        <Button type="submit" variant="primary" isDisabled={isPending} id="submit-vehicle">
          {isPending ? "Menyimpan..." : vehicle?.id ? "Perbarui" : "Simpan"}
        </Button>
      </div>
    </form>
  )
}
