"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { createVehicle, updateVehicle } from "@/actions/vehicle.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input, TextArea, ComboBox, ListBox, Label } from "@heroui/react"
import { Button } from "@/components/ui/page-header"

interface VehicleFormProps {
  brands: { id: number; name: string
}[]
  vehicle?: { id: number; plateNumber: string; plateNo?: string; brandId: number; modelId?: number | null; year?: number | null; color?: string | null; customerId?: number | null; notes?: string | null }
  models: { id: number; name: string; vehicleBrandId: number }[]
  customers: { id: number; name: string }[]
}

export function VehicleForm({ brands, models, customers, vehicle }: VehicleFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget)
        const result = vehicle?.id ? await updateVehicle(vehicle.id, formData) : await createVehicle(formData)
        if (result.success) {
          showSuccess(vehicle?.id ? "Data berhasil diupdate" : "Data berhasil ditambahkan")
          router.push("/kendaraan")
          router.refresh()
        }
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
          <ComboBox name="brandId" className="w-full">
            <Label>Merek</Label>
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
          <ComboBox name="modelId" className="w-full">
            <Label>Model</Label>
            <ComboBox.InputGroup><Input placeholder="Cari model..." /><ComboBox.Trigger /></ComboBox.InputGroup>
            <ComboBox.Popover>
              <ListBox>
                {models.map((m) => (
                  <ListBox.Item key={m.id} id={String(m.id)} textValue={m.name}>{m.name}</ListBox.Item>
                ))}
              </ListBox>
            </ComboBox.Popover>
          </ComboBox>
        </div>
        <div className="flex flex-col gap-1.5">
          <ComboBox name="customerId" className="w-full">
            <Label>Customer</Label>
            <ComboBox.InputGroup><Input placeholder="Cari customer..." /><ComboBox.Trigger /></ComboBox.InputGroup>
            <ComboBox.Popover>
              <ListBox>
                {customers.map((c) => (
                  <ListBox.Item key={c.id} id={String(c.id)} textValue={c.name}>{c.name}</ListBox.Item>
                ))}
              </ListBox>
            </ComboBox.Popover>
          </ComboBox>
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
          <TextArea id="notes" name="notes" rows={3} placeholder="Catatan kendaraan..." defaultValue={vehicle?.notes ?? ""} />
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <Button type="button" onPress={() => router.back()}>Batal</Button>
        <Button type="submit" variant="primary" isDisabled={isPending} id="submit-vehicle">
          {isPending ? "Menyimpan..." : vehicle?.id ? "Update" : "Simpan"}
        </Button>
      </div>
    </form>
  )
}
