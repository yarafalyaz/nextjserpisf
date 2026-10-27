"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { createProductionOrder, updateProductionOrder } from "@/actions/manufacturing.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { Combobox } from "@/components/ui/combobox"
import { AppDatePicker } from "@/components/ui/date-picker"
import { Button } from "@/components/ui/button"

interface ProductionOrderFormProps {
  products: { id: number; name: string; sku: string | null }[]
  /** Pilihan dokumen sumber (perintah kerja) — tautan `workOrderId`. */
  workOrders?: { id: number; documentNo: string }[]
  /** Terisi dari segmen `perintah-kerja/<slug>` saat masuk lewat "Buat Perintah Produksi" dari WO. */
  defaultWorkOrderId?: number | null
  /** Terisi dari segmen `produk/<slug>` (produk jadi yang cocok dengan item WO). */
  defaultProductId?: number | null
  order?: { id: number; workOrderId?: number | null; itemId?: number; productId?: number | null; qty: number; startDate?: string | null; endDate?: string | null; notes?: string | null }
}

export function ProductionOrderForm({ products, workOrders = [], defaultWorkOrderId = null, defaultProductId = null, order }: ProductionOrderFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [productId, setProductId] = useState(
    order?.productId ? String(order.productId) : defaultProductId ? String(defaultProductId) : "",
  )
  const [workOrderId, setWorkOrderId] = useState(
    order?.workOrderId ? String(order.workOrderId) : defaultWorkOrderId ? String(defaultWorkOrderId) : "",
  )

  function onSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget)
        const result = order?.id ? await updateProductionOrder(order.id, formData) : await createProductionOrder(formData)
        if (result.success) {
          showSuccess(order?.id ? "Data berhasil diperbarui" : "Data berhasil ditambahkan")
          router.push("/produksi/production-orders")
          router.refresh()
        } else {
          showError(result.error || "Gagal menyimpan data")
        }
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan data")
      }
    })
  }

  return (
    <form onSubmit={onSubmit} aria-busy={isPending} aria-label={order?.id ? "Formulir ubah perintah produksi" : "Formulir tambah perintah produksi"} className="bg-surface rounded-xl border border-default shadow-sm p-4 sm:p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="productId">Produk <span className="text-destructive" aria-hidden="true">*</span></Label>
          <Combobox
            id="productId"
            name="productId"
            required
            value={productId || null}
            onChange={(key) => setProductId(key ?? "")}
            placeholder="Cari produk..."
            options={products.map((p) => ({ value: String(p.id), label: `${p.sku ? `${p.sku} - ` : ""}${p.name}` }))}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="qty">Jumlah Produksi <span className="text-destructive" aria-hidden="true">*</span></Label>
          <Input id="qty" name="qty" type="number" placeholder="Jml" min={1} required defaultValue={order?.qty ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="workOrderId">Perintah Kerja</Label>
          <Combobox
            id="workOrderId"
            name="workOrderId"
            value={workOrderId || null}
            onChange={(key) => setWorkOrderId(key ?? "")}
            placeholder="— Tanpa perintah kerja —"
            options={workOrders.map((wo) => ({ value: String(wo.id), label: wo.documentNo }))}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <AppDatePicker
            label="Tanggal Mulai"
            name="startDate"
            defaultValue={order?.startDate ? new Date(order.startDate).toISOString().split("T")[0] : undefined}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <AppDatePicker
            label="Tanggal Selesai"
            name="endDate"
            defaultValue={order?.endDate ? new Date(order.endDate).toISOString().split("T")[0] : undefined}
          />
        </div>
        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="notes">Catatan</Label>
          <Textarea id="notes" name="notes" rows={3} placeholder="Catatan produksi..." defaultValue={order?.notes ?? ""} />
        </div>
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3 mt-6 pt-5 border-t border-default">
        <Button type="button" onPress={() => router.back()} className="w-full sm:w-auto">Batal</Button>
        <Button type="submit" isDisabled={isPending} id="submit-production-order" className="w-full sm:w-auto">
          {isPending ? "Menyimpan..." : order?.id ? "Perbarui" : "Simpan"}
        </Button>
      </div>
    </form>
  )
}
