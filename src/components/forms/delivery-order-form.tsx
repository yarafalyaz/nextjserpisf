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
import { Button } from "@/components/ui/button"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import type { DeliveryOrderLineOption } from "../../app/(dashboard)/penjualan/surat-jalan/_lib/order-lines"

interface DeliveryOrderSalesOrder {
  id: number
  documentNo: string
  customer: { name: string }
  /** Baris bersisa (qty pesanan − qty sudah masuk surat jalan). */
  lines?: DeliveryOrderLineOption[]
}

interface DeliveryOrderFormProps {
  salesOrders: DeliveryOrderSalesOrder[]
  /** Pilihan awal dari segmen `pesanan/<slug>` / `faktur/<slug>`. */
  defaultSalesOrderId?: number
  deliveryOrder?: { id: number; salesOrderId: number; date: string; doNumber?: string | null; deliveryDate?: string | null; notes?: string | null; shippingAddress?: string | null; shippingProvince?: string | null; shippingCity?: string | null; shippingDistrict?: string | null; shippingVillage?: string | null; shippingPostalCode?: string | null; shippingPhone?: string | null; vehicleNumber?: string | null; items?: Array<{ itemId: number; qty: number; description?: string | null }> }
}

/** Baris yang bisa disunting di form: sisa dari baris pesanan + qty yang dikirim. */
interface DeliveryOrderItemRow extends DeliveryOrderLineOption {
  /** Qty yang benar-benar dikirim; awalnya sisa penuh. */
  qty: number
  /** Kunci baris untuk React. */
  rowKey: string
}

function rowsForOrder(salesOrders: DeliveryOrderSalesOrder[], salesOrderId: string): DeliveryOrderItemRow[] {
  const order = salesOrders.find((so) => String(so.id) === salesOrderId)
  if (!order) return []
  // Default qty = sisa penuh (pengiriman penuh), operator bisa menurunkannya untuk
  // pengiriman sebagian.
  return (order.lines ?? []).map((line, index) => ({ ...line, qty: line.remainingQty, rowKey: `${line.salesOrderItemId}-${index}` }))
}

export function DeliveryOrderForm({ salesOrders, defaultSalesOrderId, deliveryOrder }: DeliveryOrderFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [date, setDate] = useState(deliveryOrder?.date ?? toLocalDateOnly(new Date()))
  const [deliveryDate, setDeliveryDate] = useState(deliveryOrder?.deliveryDate ?? "")
  const [salesOrderId, setSalesOrderId] = useState(
    deliveryOrder?.salesOrderId
      ? String(deliveryOrder.salesOrderId)
      : defaultSalesOrderId
        ? String(defaultSalesOrderId)
        : "",
  )
  const isEdit = Boolean(deliveryOrder?.id)
  const [itemRows, setItemRows] = useState<DeliveryOrderItemRow[]>(() =>
    isEdit ? [] : rowsForOrder(salesOrders, defaultSalesOrderId ? String(defaultSalesOrderId) : ""),
  )

  function updateItemQty(index: number, raw: string) {
    const parsed = Number(raw)
    const qty = Number.isFinite(parsed) && parsed > 0 ? parsed : 0
    setItemRows((prev) => prev.map((row, i) => (i === index ? { ...row, qty } : row)))
  }

  function onSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget)
        // Baris surat jalan dikirim sebagai JSON; tanpa ini DeliveryOrderItem tak
        // pernah lahir dan laporan Pemenuhan Pesanan selalu 0 terkirim.
        // Hanya qty > 0 yang dikirim supaya baris yang dikosongkan operator tidak
        // menjadi baris surat jalan berisi nol.
        formData.set("salesOrderId", salesOrderId)
        if (!isEdit) {
          formData.set(
            "items",
            JSON.stringify(
              itemRows
                .filter((row) => row.qty > 0)
                .map((row) => ({
                  salesOrderItemId: row.salesOrderItemId,
                  itemId: row.itemId,
                  qty: row.qty,
                })),
            ),
          )
        }
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
    <form onSubmit={onSubmit} aria-busy={isPending} aria-label={isEdit ? "Formulir ubah surat jalan" : "Formulir tambah surat jalan"} className="bg-surface rounded-xl border border-default shadow-sm p-4 sm:p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="salesOrderId">Pesanan Penjualan <span className="text-destructive" aria-hidden="true">*</span></Label>
          <Combobox
            id="salesOrderId"
            name="salesOrderId"
            required
            value={salesOrderId || null}
            onChange={(key) => {
              const next = key ?? ""
              setSalesOrderId(next)
              // Ganti pesanan = ganti baris: baris pesanan lama tidak boleh ikut
              // terbawa ke pesanan lain.
              if (!isEdit) setItemRows(rowsForOrder(salesOrders, next))
            }}
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

      {/* Baris barang */}
      <div className="mt-6 pt-5 border-t border-default">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <h3 className="text-base font-semibold text-foreground">Barang Dikirim</h3>
          <span className="text-xs text-muted-foreground">
            Jumlah awal = sisa pesanan (qty pesanan &minus; sudah dikirim)
          </span>
        </div>

        {isEdit ? (
          (deliveryOrder?.items?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">
              Surat jalan ini belum punya baris barang, jadi belum bisa ditandai dikirim.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="text-left">Barang</th>
                    <th className="text-right">Jumlah</th>
                  </tr>
                </thead>
                <tbody>
                  {deliveryOrder?.items?.map((item, index) => (
                    <tr key={`${item.itemId}-${index}`}>
                      <td>{item.description || `Item #${item.itemId}`}</td>
                      <td className="text-right">{Number(item.qty)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-muted-foreground mt-2">
                Baris barang tidak diubah dari halaman ini agar jejak pengiriman tetap utuh.
              </p>
            </div>
          )
        ) : salesOrderId === "" ? (
          <p className="text-sm text-muted-foreground">Pilih Pesanan Penjualan dulu untuk mengisi baris barang.</p>
        ) : itemRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Pesanan ini tidak punya sisa yang bisa dikirim (semua barisnya sudah masuk surat jalan atau barangnya bukan barang katalog).
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="text-left">Barang</th>
                  <th className="text-right">Dipesan</th>
                  <th className="text-right">Sudah Dikirim</th>
                  <th className="text-right">Sisa</th>
                  <th className="text-right" style={{ width: "140px" }}>Kirim</th>
                </tr>
              </thead>
              <tbody>
                {itemRows.map((row, index) => (
                  <tr key={row.rowKey}>
                    <td>{row.description}</td>
                    <td className="text-right">{row.orderedQty}</td>
                    <td className="text-right">{row.shippedQty}</td>
                    <td className="text-right">{row.remainingQty}</td>
                    <td className="text-right">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className="form-input text-right"
                        style={{ fontSize: "0.8125rem", padding: "6px 8px" }}
                        aria-label={`Jumlah kirim baris ${index + 1}`}
                        value={row.qty}
                        onChange={(e) => updateItemQty(index, e.target.value)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3 mt-6 pt-5 border-t border-default">
        <Button type="button" className="w-full sm:w-auto" onPress={() => router.back()} >Batal</Button>
        <Button type="submit" className="w-full sm:w-auto" isDisabled={isPending} >{isPending ? "Menyimpan..." : deliveryOrder?.id ? "Perbarui" : "Simpan"}</Button>
      </div>
    </form>
  )
}
