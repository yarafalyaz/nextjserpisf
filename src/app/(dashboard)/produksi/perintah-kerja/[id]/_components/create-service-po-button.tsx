"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { createServicePurchaseOrderFromWorkOrder } from "@/actions/purchase.actions"
import { Button } from "@/components/ui/button"
import { Combobox } from "@/components/ui/combobox"
import { showSuccess, showError } from "@/lib/utils/toast"

interface ServiceItem {
  itemId: number
  name: string
  qty: number
  cost: number
  vendorId: number | null
}

interface Props {
  workOrderId: number
  serviceItems: ServiceItem[]
  vendors: { id: number; name: string }[]
}

/**
 * "PO Jasa dari WO" control (PRD FAB-08 / PUR-17). Bundles the work order's
 * service items into one draft service PO so subcontract work (coating,
 * machining, laser cutting) can be purchased and received — the service GRN
 * expenses the cost instead of moving stock.
 */
export function CreateServicePoButton({ workOrderId, serviceItems, vendors }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)

  const firstItem = serviceItems[0]
  const [vendorId, setVendorId] = useState<string>(firstItem?.vendorId ? String(firstItem.vendorId) : "")
  const [force, setForce] = useState(false)

  if (serviceItems.length === 0) return null

  const total = serviceItems.reduce((s, i) => s + i.qty * i.cost, 0)

  function submit() {
    if (!vendorId) {
      showError("Pilih pemasok jasa terlebih dahulu")
      return
    }
    startTransition(async () => {
      try {
        const res = await createServicePurchaseOrderFromWorkOrder(workOrderId, Number(vendorId), { force })
        if (res?.success) {
          showSuccess(`PO jasa ${res.documentNo ?? ""} dibuat (draft)`)
          setOpen(false)
          router.refresh()
        } else {
          showError(res?.error || "Gagal membuat PO jasa")
        }
      } catch (e) {
        showError(e instanceof Error ? e.message : "Gagal membuat PO jasa")
      }
    })
  }

  if (!open) {
    return (
      <Button variant="secondary" isDisabled={isPending} onPress={() => setOpen(true)}>
        + PO Jasa ({serviceItems.length})
      </Button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-xl border border-default bg-surface p-5 shadow-lg flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold text-foreground">Buat PO Jasa/Subkontrak</h2>
          <p className="text-xs text-muted-foreground">
            Item jasa pada perintah kerja ini akan digabung menjadi satu PO jasa (draft) tertaut
            ke perintah kerja. Penerimaannya tidak menggerakkan stok — biaya langsung dibebankan.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground" htmlFor="service-po-vendor">
            Pemasok Jasa *
          </label>
          <Combobox
            options={vendors.map((v) => ({ value: String(v.id), label: v.name }))}
            value={vendorId || null}
            onChange={(v) => setVendorId(v ?? "")}
            placeholder="Cari pemasok..."
          />
        </div>

        <div className="rounded-lg border border-default bg-muted/30 p-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground text-xs">
                <th className="text-left font-medium">Item Jasa</th>
                <th className="text-right font-medium">Qty</th>
                <th className="text-right font-medium">Biaya/Unit</th>
              </tr>
            </thead>
            <tbody>
              {serviceItems.map((it) => (
                <tr key={it.itemId}>
                  <td className="py-0.5">{it.name}</td>
                  <td className="py-0.5 text-right">{it.qty}</td>
                  <td className="py-0.5 text-right">
                    {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(it.cost)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} className="h-4 w-4 rounded border-default" />
          Buat ulang walau sudah ada PO jasa aktif untuk perintah kerja ini
        </label>

        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Total: {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(total)}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" isDisabled={isPending} onPress={() => setOpen(false)}>
              Batal
            </Button>
            <Button variant="primary" isDisabled={isPending || !vendorId} onPress={submit}>
              {isPending ? "Membuat..." : "Buat PO Jasa"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
