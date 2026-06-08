"use client"

import { useRouter } from "next/navigation"
import { useTransition, useMemo, useState } from "react"
import { createCustomerVehicle, updateCustomerVehicle } from "@/actions/vehicle.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { Checkbox } from "@/components/ui/shadcn/checkbox"
import { FormSelect } from "@/components/ui/form-select"
import { Combobox } from "@/components/ui/combobox"
import { FormCard, FormSection, FormActions } from "@/components/ui/form-section"
import { Button } from "@/components/ui/page-header"

interface Brand {
  id: number
  name: string
  models: {
    id: number
    name: string
    variants: { id: number; name: string }[]
  }[]
}

interface VehicleData {
  id: number
  vehicleId: number
  brandId: number | null
  modelId: number | null
  variantId: number | null
  licensePlate: string
  year: number | null
  color: string
  vehicleType: string
  transmission: string
  chassisNumber: string
  engineNumber: string
  isActive: boolean
  notes: string
}

interface CustomerVehicleFormProps {
  customerId: number
  brands: Brand[]
  vehicle?: VehicleData
}

export function CustomerVehicleForm({ customerId, brands, vehicle }: CustomerVehicleFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [selectedBrandId, setSelectedBrandId] = useState<number | null>(vehicle?.brandId || null)
  const [selectedModelId, setSelectedModelId] = useState<number | null>(vehicle?.modelId || null)
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(vehicle?.variantId || null)
  const [isActive, setIsActive] = useState(vehicle?.isActive ?? true)

  const models = useMemo(() => {
    if (!selectedBrandId) return []
    const brand = brands.find((b) => b.id === selectedBrandId)
    return brand?.models || []
  }, [selectedBrandId, brands])

  const variants = useMemo(() => {
    if (!selectedModelId) return []
    const model = models.find((m) => m.id === selectedModelId)
    return model?.variants || []
  }, [selectedModelId, models])

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const form = e.currentTarget
        const formData = new FormData(form)
        formData.set("customerId", String(customerId))
        formData.set("isActive", isActive ? "true" : "false")

        if (!selectedVariantId) {
          showError("Pilih varian kendaraan")
          return
        }

        formData.set("variantId", String(selectedVariantId))

        if (vehicle?.id) {
          await updateCustomerVehicle(vehicle.id, formData)
          showSuccess("Kendaraan berhasil diperbarui")
        } else {
          await createCustomerVehicle(formData)
          showSuccess("Kendaraan berhasil ditambahkan")
        }
        router.push(`/master/pelanggan/${customerId}/kendaraan`)
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan data")
      }
    })
  }

  return (
    <form onSubmit={handleSubmit}>
      <FormCard>
        <FormSection title="Informasi Kendaraan">
          <div className="flex flex-col gap-1.5">
            <Label>Merek Kendaraan *</Label>
            <Combobox
              value={selectedBrandId ? String(selectedBrandId) : null}
              onChange={(key) => {
                setSelectedBrandId(key ? Number(key) : null)
                setSelectedModelId(null)
                setSelectedVariantId(null)
              }}
              placeholder="Cari merek..."
              options={brands.map((brand) => ({ value: String(brand.id), label: brand.name }))}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Model Kendaraan *</Label>
            <Combobox
              value={selectedModelId ? String(selectedModelId) : null}
              onChange={(key) => {
                setSelectedModelId(key ? Number(key) : null)
                setSelectedVariantId(null)
              }}
              disabled={!selectedBrandId}
              placeholder="Cari model..."
              options={models.map((model) => ({ value: String(model.id), label: model.name }))}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Varian *</Label>
            <Combobox
              value={selectedVariantId ? String(selectedVariantId) : null}
              onChange={(key) => setSelectedVariantId(key ? Number(key) : null)}
              disabled={!selectedModelId}
              placeholder="Cari varian..."
              options={variants.map((variant) => ({ value: String(variant.id), label: variant.name }))}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="licensePlate">Plat Nomor</Label>
            <Input id="licensePlate" name="licensePlate" defaultValue={vehicle?.licensePlate || ""} placeholder="B 1234 ABC" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="year">Tahun</Label>
            <Input id="year" name="year" type="number" defaultValue={vehicle?.year || ""} placeholder="2024" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="color">Warna</Label>
            <Input id="color" name="color" defaultValue={vehicle?.color || ""} placeholder="Hitam" />
          </div>
        </FormSection>

        <FormSection title="Detail Teknis">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vehicleType">Tipe Kendaraan</Label>
            <Input id="vehicleType" name="vehicleType" defaultValue={vehicle?.vehicleType || ""} placeholder="SUV, Sedan, MPV..." />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="transmission">Transmisi</Label>
            <FormSelect
              id="transmission"
              name="transmission"
              defaultValue={vehicle?.transmission || undefined}
              placeholder="Pilih Transmisi"
              options={[
                { value: "manual", label: "Manual" },
                { value: "automatic", label: "Otomatis" },
                { value: "cvt", label: "CVT" },
              ]}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="chassisNumber">No. Rangka</Label>
            <Input id="chassisNumber" name="chassisNumber" defaultValue={vehicle?.chassisNumber || ""} placeholder="Nomor rangka" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="engineNumber">No. Mesin</Label>
            <Input id="engineNumber" name="engineNumber" defaultValue={vehicle?.engineNumber || ""} placeholder="Nomor mesin" />
          </div>
        </FormSection>

        <FormSection title="Lainnya" columns={1}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Catatan</Label>
            <Textarea id="notes" name="notes" defaultValue={vehicle?.notes || ""} rows={3} placeholder="Catatan tambahan..." />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox id="isActive" checked={isActive} onCheckedChange={(checked) => setIsActive(checked === true)} />
            <Label htmlFor="isActive">Aktif</Label>
          </div>
        </FormSection>

        <FormActions>
          <Button type="button" onPress={() => router.back()}>Batal</Button>
          <Button type="submit" variant="primary" isDisabled={isPending}>
            {isPending ? "Menyimpan..." : vehicle?.id ? "Perbarui" : "Simpan"}
          </Button>
        </FormActions>
      </FormCard>
    </form>
  )
}
