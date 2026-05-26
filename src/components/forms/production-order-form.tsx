// @ts-nocheck
"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { createProductionOrder, updateProductionOrder } from "@/actions/manufacturing.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input, ComboBox, ListBox, Label } from "@heroui/react"

interface ProductionOrderFormProps {
  products: { id: number; name: string; sku: string | null
}[]
  order?: any
}

export function ProductionOrderForm({ products, order }: ProductionOrderFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget)
        const result = order?.id ? await updateProductionOrder(order.id, formData) : await createProductionOrder(formData)
        if (result.success) {
          showSuccess(order?.id ? "Data berhasil diupdate" : "Data berhasil ditambahkan")
          router.push("/manufacturing/production-orders")
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
          <ComboBox name="productId" className="w-full" isRequired>
            <Label>Produk *</Label>
            <ComboBox.InputGroup><Input placeholder="Cari produk..." /><ComboBox.Trigger /></ComboBox.InputGroup>
            <ComboBox.Popover>
              <ListBox>
                {products.map((p) => (
                  <ListBox.Item key={p.id} id={String(p.id)} textValue={`${p.sku ? `${p.sku} - ` : ""}${p.name}`}>{p.sku ? `${p.sku} - ` : ""}{p.name}</ListBox.Item>
                ))}
              </ListBox>
            </ComboBox.Popover>
          </ComboBox>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="qty">Jumlah Produksi *</Label>
          <Input id="qty" name="qty" type="number" placeholder="Qty" min={1} required defaultValue={order?.qty ?? ""} />
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <button type="button" onClick={() => router.back()} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all">Batal</button>
        <button type="submit" disabled={isPending} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="submit-production-order">
          {isPending ? "Menyimpan..." : order?.id ? "Update" : "Simpan"}
        </button>
      </div>
    </form>
  )
}
