"use client"

import { useRouter } from "next/navigation"
import { useTransition, useMemo, useState } from "react"
import { createCustomerVehicle, updateCustomerVehicle } from "@/actions/vehicle.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Select, ComboBox, ListBox, Label, Checkbox, Input, TextArea } from "@heroui/react"
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
          showSuccess("Kendaraan berhasil diupdate")
        } else {
          await createCustomerVehicle(formData)
          showSuccess("Kendaraan berhasil ditambahkan")
        }
        router.push(`/master/customers/${customerId}/vehicles`)
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
            <ComboBox
              selectedKey={selectedBrandId ? String(selectedBrandId) : null}
              onSelectionChange={(key) => {
                setSelectedBrandId(key ? Number(key) : null)
                setSelectedModelId(null)
                setSelectedVariantId(null)
              }}
              className="w-full"
            >
              <Label>Brand Kendaraan *</Label>
              <ComboBox.InputGroup>
                <Input placeholder="Cari brand..." />
                <ComboBox.Trigger />
              </ComboBox.InputGroup>
              <ComboBox.Popover>
                <ListBox>
                  {brands.map((brand) => (
                    <ListBox.Item key={brand.id} id={String(brand.id)} textValue={brand.name}>
                      {brand.name}
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  ))}
                </ListBox>
              </ComboBox.Popover>
            </ComboBox>
          </div>

          <div className="flex flex-col gap-1.5">
            <ComboBox
              selectedKey={selectedModelId ? String(selectedModelId) : null}
              onSelectionChange={(key) => {
                setSelectedModelId(key ? Number(key) : null)
                setSelectedVariantId(null)
              }}
              className="w-full"
              isDisabled={!selectedBrandId}
            >
              <Label>Model Kendaraan *</Label>
              <ComboBox.InputGroup>
                <Input placeholder="Cari model..." />
                <ComboBox.Trigger />
              </ComboBox.InputGroup>
              <ComboBox.Popover>
                <ListBox>
                  {models.map((model) => (
                    <ListBox.Item key={model.id} id={String(model.id)} textValue={model.name}>
                      {model.name}
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  ))}
                </ListBox>
              </ComboBox.Popover>
            </ComboBox>
          </div>

          <div className="flex flex-col gap-1.5">
            <ComboBox
              selectedKey={selectedVariantId ? String(selectedVariantId) : null}
              onSelectionChange={(key) => setSelectedVariantId(key ? Number(key) : null)}
              className="w-full"
              isDisabled={!selectedModelId}
            >
              <Label>Varian *</Label>
              <ComboBox.InputGroup>
                <Input placeholder="Cari varian..." />
                <ComboBox.Trigger />
              </ComboBox.InputGroup>
              <ComboBox.Popover>
                <ListBox>
                  {variants.map((variant) => (
                    <ListBox.Item key={variant.id} id={String(variant.id)} textValue={variant.name}>
                      {variant.name}
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  ))}
                </ListBox>
              </ComboBox.Popover>
            </ComboBox>
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
            <Select
              selectedKey={vehicle?.transmission || null}
              name="transmission"
              className="w-full"
            >
              <Label>Transmisi</Label>
              <Select.Trigger><Select.Value>{({ selectedText }) => selectedText || "Pilih Transmisi"}</Select.Value><Select.Indicator /></Select.Trigger>
              <Select.Popover>
                <ListBox>
                  <ListBox.Item id="manual" textValue="Manual">Manual<ListBox.ItemIndicator /></ListBox.Item>
                  <ListBox.Item id="automatic" textValue="Automatic">Automatic<ListBox.ItemIndicator /></ListBox.Item>
                  <ListBox.Item id="cvt" textValue="CVT">CVT<ListBox.ItemIndicator /></ListBox.Item>
                </ListBox>
              </Select.Popover>
            </Select>
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
            <TextArea id="notes" name="notes" defaultValue={vehicle?.notes || ""} rows={3} placeholder="Catatan tambahan..." />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox isSelected={isActive} onChange={setIsActive} id="isActive">
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
              <Checkbox.Content>
                <Label htmlFor="isActive">Aktif</Label>
              </Checkbox.Content>
            </Checkbox>
          </div>
        </FormSection>

        <FormActions>
          <Button onPress={() => router.back()}>Batal</Button>
          <Button type="submit" variant="primary" isDisabled={isPending}>
            {isPending ? "Menyimpan..." : vehicle?.id ? "Update" : "Simpan"}
          </Button>
        </FormActions>
      </FormCard>
    </form>
  )
}
