"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { AppDatePicker } from "@/components/ui/date-picker"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { Combobox } from "@/components/ui/combobox"
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
  const [salesOrderId, setSalesOrderId] = useState(deliveryOrder?.salesOrderId ? String(deliveryOrder.salesOrderId) : "")

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget)
        const { createDeliveryOrder, updateDeliveryOrder } = await import("@/actions/sales.actions")
        const result = deliveryOrder?.id ? await updateDeliveryOrder(deliveryOrder.id, formData) : await createDeliveryOrder(formData)
        if (result && !result.success) { showError(result.error || "Gagal menyimpan data"); return }
        showSuccess(deliveryOrder?.id ? "Data berhasil diperbarui" : "Data berhasil ditambahkan")
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
          <Label>Pesanan Penjualan *</Label>
          <Combobox
            name="salesOrderId"
            value={salesOrderId || null}
            onChange={(key) => setSalesOrderId(key ?? "")}
            placeholder="Cari pesanan penjualan..."
            options={salesOrders.map((so) => ({ value: String(so.id), label: `${so.documentNo} - ${so.customer.name}` }))}
          />
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
          <Textarea id="notes" name="notes" rows={3} placeholder="Catatan pengiriman..." defaultValue={deliveryOrder?.notes ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="shippingAddress">Alamat Pengiriman</Label>
          <Textarea id="shippingAddress" name="shippingAddress" rows={3} placeholder="Alamat lengkap pengiriman" defaultValue={deliveryOrder?.shippingAddress ?? ""} />
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
        <Button type="button" onPress={() => router.back()} >Batal</Button>
        <Button type="submit" isDisabled={isPending} >{isPending ? "Menyimpan..." : deliveryOrder?.id ? "Perbarui" : "Simpan"}</Button>
      </div>
    </form>
  )
}
