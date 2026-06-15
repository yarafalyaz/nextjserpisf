"use client"

import React from "react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { createGoodsReceipt, updateGoodsReceipt } from "@/actions/purchase.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Combobox } from "@/components/ui/combobox"
import { FormCard, FormSection, FormActions } from "@/components/ui/form-section"
import { Button } from "@/components/ui/button"

interface ItemMeta {
  name: string
  sku: string
  trackBatch: boolean
  trackSerial: boolean
  unitOfMeasure: string
  uomConversions: Array<{ code: string; factorToBase: number }>
}

interface GRFormProps {
  purchaseOrders: Array<{ id: number; documentNo: string; vendor?: { name: string }; items: Array<{ id: number; itemId: number; qty: number; unitPrice: number; receivedQty?: number; item: ItemMeta }> }>
  warehouses: { id: number; name: string }[]
  receipt?: { id: number; purchaseOrderId: number; warehouseId?: number; date: string; notes?: string | null }
  defaultPoId?: number
}

interface GRItemRow {
  itemId: number
  qty: number
  unitCost: number
  qtyOrdered: number
  warehouseId: string
  uom: string
  batchNumber: string
  expiryDate: string
  serialNumbers: string
  // metadata
  name: string
  trackBatch: boolean
  trackSerial: boolean
  unitOfMeasure: string
  uomConversions: Array<{ code: string; factorToBase: number }>
}

export function GoodsReceiptForm({ purchaseOrders, warehouses, defaultPoId, receipt }: GRFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [poId, setPoId] = useState(defaultPoId ? String(defaultPoId) : "")
  const [warehouseId, setWarehouseId] = useState(receipt?.warehouseId ? String(receipt.warehouseId) : "")
  const [grItems, setGrItems] = useState<GRItemRow[]>([])

  const selectedPO = purchaseOrders.find((po) => po.id === Number(poId))

  function handlePoChange(key: string | null) {
    const newPoId = key ? String(key) : ""
    setPoId(newPoId)
    const po = purchaseOrders.find((p) => p.id === Number(newPoId))
    if (po) {
      setGrItems(
        po.items.map((item) => ({
          itemId: item.itemId,
          qty: Number(item.qty) - Number(item.receivedQty || 0),
          unitCost: Number(item.unitPrice),
          qtyOrdered: Number(item.qty),
          warehouseId: "",
          uom: item.item?.unitOfMeasure ?? "PCS",
          batchNumber: "",
          expiryDate: "",
          serialNumbers: "",
          name: item.item?.name ?? `Item #${item.itemId}`,
          trackBatch: item.item?.trackBatch ?? false,
          trackSerial: item.item?.trackSerial ?? false,
          unitOfMeasure: item.item?.unitOfMeasure ?? "PCS",
          uomConversions: item.item?.uomConversions ?? [],
        }))
      )
    } else {
      setGrItems([])
    }
  }

  function updateItem(index: number, patch: Partial<GRItemRow>) {
    setGrItems((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], ...patch }
      return updated
    })
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData()
        formData.append("purchaseOrderId", poId)
        formData.append("warehouseId", warehouseId)
        formData.append("date", new Date().toISOString().split("T")[0])
        const items = grItems.map((item) => {
          const serials = item.serialNumbers
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter((s) => s.length > 0)
          return {
            itemId: item.itemId,
            qty: item.qty,
            unitCost: item.unitCost,
            warehouseId: item.warehouseId ? Number(item.warehouseId) : null,
            uom: item.uom || item.unitOfMeasure,
            batchNumber: item.trackBatch && item.batchNumber.trim() ? item.batchNumber.trim() : undefined,
            expiryDate: item.trackBatch && item.expiryDate ? item.expiryDate : undefined,
            serialNumbers: item.trackSerial && serials.length > 0 ? serials : undefined,
          }
        })
        formData.append("items", JSON.stringify(items))
        const result = receipt?.id ? await updateGoodsReceipt(receipt.id, formData) : await createGoodsReceipt(formData)
        if (result && !result.success) { showError(result.error || "Gagal menyimpan data"); return }
        showSuccess(receipt?.id ? "Data berhasil diperbarui" : "Data berhasil ditambahkan")
        router.push("/pembelian/penerimaan")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan data")
      }
    })
  }

  return (
    <form onSubmit={onSubmit}>
      <FormCard>
        <FormSection title="Informasi Umum">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="purchaseOrderId">Pesanan Pembelian *</Label>
            <Combobox
              id="purchaseOrderId"
              options={purchaseOrders.map((po) => ({ value: String(po.id), label: `${po.documentNo} - ${po.vendor?.name ?? ""}` }))}
              value={poId || null}
              onChange={(key) => handlePoChange(key ? String(key) : null)}
              placeholder="Cari pesanan pembelian..."
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="warehouseId">Gudang Tujuan (Bawaan) *</Label>
            <Combobox
              id="warehouseId"
              options={warehouses.map((w) => ({ value: String(w.id), label: w.name }))}
              value={warehouseId || null}
              onChange={(key) => setWarehouseId(key ? String(key) : "")}
              placeholder="Cari gudang..."
            />
          </div>
        </FormSection>

        {selectedPO && grItems.length > 0 && (
          <FormSection title="Item" columns={1}>
            <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[700px]" style={{ fontSize: "0.8125rem" }}>
              <thead><tr><th>Item</th><th>Qty Dipesan</th><th>Sisa</th><th>Satuan</th><th>Gudang (per item)</th></tr></thead>
              <tbody>
                {grItems.map((row, index) => {
                  const uomOptions = [row.unitOfMeasure, ...row.uomConversions.map((u) => u.code)]
                  const hasConversions = row.uomConversions.length > 0
                  const expiryId = `expiry-${index}`
                  const batchId = `batch-${index}`
                  const serialId = `serial-${index}`
                  return (
                    <React.Fragment key={row.itemId}>
                      <tr>
                        <td>{row.name}</td>
                        <td className="text-right">{row.qtyOrdered}</td>
                        <td className="text-right font-medium">{row.qty}</td>
                        <td>
                          {hasConversions ? (
                            <Combobox
                              value={row.uom || null}
                              onChange={(key) => updateItem(index, { uom: key ?? "" })}
                              options={uomOptions.map((code) => ({ value: code, label: code }))}
                              placeholder="Pilih satuan..."
                              className="w-full"
                            />
                          ) : (
                            <span className="text-muted-foreground">{row.unitOfMeasure}</span>
                          )}
                        </td>
                        <td>
                          <Combobox
                            value={row.warehouseId || null}
                            onChange={(key) => updateItem(index, { warehouseId: key ?? "" })}
                            options={warehouses.map((w) => ({ value: String(w.id), label: w.name }))}
                            placeholder="— Bawaan —"
                            className="w-full"
                          />
                        </td>
                      </tr>
                      {(row.trackBatch || row.trackSerial) && (
                        <tr>
                          <td colSpan={5} style={{ paddingBottom: "12px" }}>
                            <div className="flex flex-col gap-3 rounded-md border border-border bg-muted/30 p-3">
                              {row.trackBatch && (
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                  <div className="flex flex-col gap-1.5">
                                    <Label htmlFor={batchId}>No. Batch/Lot</Label>
                                    <input
                                      id={batchId}
                                      type="text"
                                      value={row.batchNumber}
                                      onChange={(e) => updateItem(index, { batchNumber: e.target.value })}
                                      placeholder="Mis. LOT-2024-001"
                                      className="form-input"
                                      style={{ fontSize: "0.8125rem", padding: "6px" }}
                                    />
                                  </div>
                                  <div className="flex flex-col gap-1.5">
                                    <Label htmlFor={expiryId}>Kedaluwarsa</Label>
                                    <input
                                      id={expiryId}
                                      type="date"
                                      value={row.expiryDate}
                                      onChange={(e) => updateItem(index, { expiryDate: e.target.value })}
                                      className="form-input"
                                      style={{ fontSize: "0.8125rem", padding: "6px" }}
                                    />
                                  </div>
                                </div>
                              )}
                              {row.trackSerial && (
                                <div className="flex flex-col gap-1.5">
                                  <Label htmlFor={serialId}>Nomor Seri (satu per baris)</Label>
                                  <textarea
                                    id={serialId}
                                    value={row.serialNumbers}
                                    onChange={(e) => updateItem(index, { serialNumbers: e.target.value })}
                                    rows={3}
                                    placeholder={"SN-0001\nSN-0002"}
                                    className="form-input"
                                    style={{ fontSize: "0.8125rem", padding: "6px" }}
                                  />
                                  <p className="text-xs text-muted-foreground">
                                    Jumlah nomor seri harus sama dengan qty ({row.qty}).
                                  </p>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
            </div>
          </FormSection>
        )}

        <FormActions>
          <Button type="button" onPress={() => router.back()}>Batal</Button>
          <Button type="submit" variant="primary" isDisabled={isPending || !poId || !warehouseId}>
            {isPending ? "Memproses..." : "Terima Barang"}
          </Button>
        </FormActions>
      </FormCard>
    </form>
  )
}
