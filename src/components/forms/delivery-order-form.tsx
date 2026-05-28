"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { AppDatePicker } from "@/components/ui/date-picker"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input, TextArea, ComboBox, ListBox, Label } from "@heroui/react"
import { AddressPicker } from "@/components/ui/address-picker"
import { Button } from "@/components/ui/page-header"

interface DeliveryOrderFormProps {
  salesOrders: { id: number; documentNo: string; customer: { name: string } }[]
  deliveryOrder?: { id: number; salesOrderId: number; date: string; doNumber?: string | null; deliveryDate?: string | null; notes?: string | null; shippingAddress?: string | null; shippingProvince?: string | null; shippingCity?: string | null; shippingDistrict?: string | null; shippingVillage?: string | null; shippingPostalCode?: string | null; shippingPhone?: string | null; vehicleNumber?: string | null; items?: Array<{ itemId: number; qty: number }> }
}

export function DeliveryOrderForm({ salesOrders, deliveryOrder }: DeliveryOrderFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [date, setDate] = useState(deliveryOrder?.date ?? new Date().toISOString().split("T")[0])
  const [deliveryDate, setDeliveryDate] = useState(deliveryOrder?.deliveryDate ?? "")

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget)
        const { createDeliveryOrder, updateDeliveryOrder } = await import("@/actions/sales.actions")
        deliveryOrder?.id ? await updateDeliveryOrder(deliveryOrder.id, formData) : await createDeliveryOrder(formData)
        showSuccess(deliveryOrder?.id ? "Data berhasil diupdate" : "Data berhasil ditambahkan")
        router.push("/penjualan/surat-jalan")
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
          <ComboBox name="salesOrderId" className="w-full" isRequired>
            <Label>Sales Order *</Label>
            <ComboBox.InputGroup><Input placeholder="Cari sales order..." /><ComboBox.Trigger /></ComboBox.InputGroup>
            <ComboBox.Popover>
              <ListBox>
                {salesOrders.map((so) => (
                  <ListBox.Item key={so.id} id={String(so.id)} textValue={`${so.documentNo} - ${so.customer.name}`}>{so.documentNo} - {so.customer.name}</ListBox.Item>
                ))}
              </ListBox>
            </ComboBox.Popover>
          </ComboBox>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="doNumber">No. DO</Label>
          <Input id="doNumber" name="doNumber" placeholder="Otomatis jika kosong" defaultValue={deliveryOrder?.doNumber ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <AppDatePicker label="Tanggal *" name="date" value={date} onChange={setDate} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <AppDatePicker label="Tanggal Pengiriman" name="deliveryDate" value={deliveryDate} onChange={setDeliveryDate} />
        </div>
        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="notes">Catatan</Label>
          <TextArea id="notes" name="notes" rows={3} placeholder="Catatan pengiriman..." defaultValue={deliveryOrder?.notes ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="shippingAddress">Alamat Pengiriman</Label>
          <TextArea id="shippingAddress" name="shippingAddress" rows={3} placeholder="Alamat lengkap pengiriman" defaultValue={deliveryOrder?.shippingAddress ?? ""} />
        </div>
        <AddressPicker prefix="shipping" defaultValues={{ province: deliveryOrder?.shippingProvince ?? undefined, city: deliveryOrder?.shippingCity ?? undefined, district: deliveryOrder?.shippingDistrict ?? undefined, village: deliveryOrder?.shippingVillage ?? undefined, postalCode: deliveryOrder?.shippingPostalCode ?? undefined }} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="shippingPhone">Telepon Penerima</Label>
          <Input id="shippingPhone" name="shippingPhone" placeholder="08xxxxxxxxxx" defaultValue={deliveryOrder?.shippingPhone ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="vehicleNumber">No. Kendaraan</Label>
          <Input id="vehicleNumber" name="vehicleNumber" placeholder="No. polisi kendaraan" defaultValue={deliveryOrder?.vehicleNumber ?? ""} />
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <Button onPress={() => router.back()} >Batal</Button>
        <Button isDisabled={isPending} >{isPending ? "Menyimpan..." : deliveryOrder?.id ? "Update" : "Simpan"}</Button>
      </div>
    </form>
  )
}
