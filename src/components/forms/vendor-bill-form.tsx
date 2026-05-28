"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { AppDatePicker } from "@/components/ui/date-picker"
import { FormAttachmentUpload } from "@/components/ui/form-attachment-upload"
import { Plus, Trash2 } from "lucide-react"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input, TextArea, ComboBox, ListBox, Label } from "@heroui/react"
import { CurrencyInput } from "@/components/ui/currency-input"
import { FormCard, FormSection, FormActions } from "@/components/ui/form-section"
import { Button } from "@/components/ui/page-header"

interface BillItem {
  itemId: string
  qty: number
  unitPrice: number
  discountPercent: number
  taxPercent: number
}

interface VendorBillFormProps {
  vendors: { id: number; name: string }[]
  bill?: { id: number; vendorId: number; purchaseOrderId?: number | null; date: string; dueDate?: string | null; notes?: string | null; vendorInvoiceNumber?: string | null; terms?: string | null; items?: Array<{ itemId: number; qty: number; unitPrice: number }> }
  items: { id: number; sku: string; name: string; cost: number; unitOfMeasure: string }[]
}

export function VendorBillForm({ vendors, items, bill }: VendorBillFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [date, setDate] = useState(new Date().toISOString().split("T")[0])
  const [dueDate, setDueDate] = useState("")
  const [billItems, setBillItems] = useState<BillItem[]>([{ itemId: "", qty: 1, unitPrice: 0, discountPercent: 0, taxPercent: 0 }])

  function addItem() {
    setBillItems([...billItems, { itemId: "", qty: 1, unitPrice: 0, discountPercent: 0, taxPercent: 0 }])
  }

  function removeItem(index: number) {
    setBillItems(billItems.filter((_, i) => i !== index))
  }

  function updateItem(index: number, field: keyof BillItem, value: string | number) {
    const updated = [...billItems]
    updated[index] = { ...updated[index], [field]: value }
    if (field === "itemId" && value) {
      const item = items.find((i) => i.id === Number(value))
      if (item) updated[index].unitPrice = Number(item.cost)
    }
    setBillItems(updated)
  }

  function calcLineTotal(item: BillItem) {
    const base = item.qty * item.unitPrice
    const discount = base * (item.discountPercent / 100)
    const afterDiscount = base - discount
    const tax = afterDiscount * (item.taxPercent / 100)
    return afterDiscount + tax
  }

  const subtotal = billItems.reduce((sum, item) => sum + item.qty * item.unitPrice, 0)
  const totalDiscount = billItems.reduce((sum, item) => sum + (item.qty * item.unitPrice * item.discountPercent / 100), 0)
  const totalTax = billItems.reduce((sum, item) => {
    const afterDisc = item.qty * item.unitPrice * (1 - item.discountPercent / 100)
    return sum + afterDisc * (item.taxPercent / 100)
  }, 0)
  const grandTotal = subtotal - totalDiscount + totalTax

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget)
        formData.set("subtotal", String(subtotal))
        formData.set("tax", String(totalTax))
        formData.set("grandTotal", String(grandTotal))
        formData.set("items", JSON.stringify(billItems))
        const { createVendorBill, updateVendorBill } = await import("@/actions/purchase.actions")
        bill?.id ? await updateVendorBill(bill.id, formData) : await createVendorBill(formData)
        showSuccess(bill?.id ? "Data berhasil diupdate" : "Data berhasil ditambahkan")
        router.push("/pembelian/tagihan")
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
            <ComboBox name="vendorId" defaultSelectedKey={bill?.vendorId ? String(bill.vendorId) : undefined} className="w-full" isRequired>
              <Label>Vendor *</Label>
              <ComboBox.InputGroup><Input placeholder="Cari vendor..." /><ComboBox.Trigger /></ComboBox.InputGroup>
              <ComboBox.Popover>
                <ListBox>
                  {vendors.map((v) => (
                    <ListBox.Item key={v.id} id={String(v.id)} textValue={v.name}>{v.name}</ListBox.Item>
                  ))}
                </ListBox>
              </ComboBox.Popover>
            </ComboBox>
          </div>
          <div className="flex flex-col gap-1.5">
            <AppDatePicker label="Tanggal *" name="date" value={date} onChange={setDate} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <AppDatePicker label="Jatuh Tempo" name="dueDate" value={dueDate} onChange={setDueDate} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vendorInvoiceNumber">No. Invoice Vendor</Label>
            <Input id="vendorInvoiceNumber" name="vendorInvoiceNumber" placeholder="No. invoice dari vendor" defaultValue={bill?.vendorInvoiceNumber ?? ""} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="terms">Syarat Pembayaran</Label>
            <Input id="terms" name="terms" placeholder="e.g. Net 30" defaultValue={bill?.terms ?? ""} />
          </div>
        </FormSection>

        <FormSection title="Detail" columns={1}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Catatan</Label>
            <TextArea id="notes" name="notes" rows={2} placeholder="Catatan..." defaultValue={bill?.notes ?? ""} />
          </div>
        </FormSection>

        <FormSection title="Item" columns={1}>
          <div>
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-base font-semibold text-foreground">Item</h3>
              <Button onPress={addItem} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-all">
                <Plus size={14} /> Tambah Item
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-default">
                    <th className="text-left py-2 px-2 font-medium text-secondary" style={{ minWidth: "200px" }}>Item</th>
                    <th className="text-left py-2 px-2 font-medium text-secondary" style={{ width: "80px" }}>Qty</th>
                    <th className="text-left py-2 px-2 font-medium text-secondary" style={{ width: "120px" }}>Harga</th>
                    <th className="text-left py-2 px-2 font-medium text-secondary" style={{ width: "80px" }}>Disc %</th>
                    <th className="text-left py-2 px-2 font-medium text-secondary" style={{ width: "80px" }}>Tax %</th>
                    <th className="text-right py-2 px-2 font-medium text-secondary" style={{ width: "120px" }}>Total</th>
                    <th style={{ width: "40px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {billItems.map((item, idx) => (
                    <tr key={idx} className="border-b border-default/50">
                      <td className="py-2 px-2">
                        <ComboBox
                          selectedKey={item.itemId || null}
                          onSelectionChange={(key) => updateItem(idx, "itemId", key ? String(key) : "")}
                          className="w-full"
                        >
                          <ComboBox.InputGroup><Input placeholder="Cari item..." /><ComboBox.Trigger /></ComboBox.InputGroup>
                          <ComboBox.Popover>
                            <ListBox>
                              {items.map((i) => (
                                <ListBox.Item key={i.id} id={String(i.id)} textValue={`${i.sku} - ${i.name}`}>
                                  {i.sku} - {i.name}
                                </ListBox.Item>
                              ))}
                            </ListBox>
                          </ComboBox.Popover>
                        </ComboBox>
                      </td>
                      <td className="py-2 px-2">
                        <Input type="number" value={String(item.qty)} onChange={(e) => updateItem(idx, "qty", (Number.isFinite(Number(e.target.value)) ? Number(e.target.value) : 0))} min={1} className="w-full" />
                      </td>
                      <td className="py-2 px-2">
                        <CurrencyInput value={item.unitPrice} onChange={(v) => updateItem(idx, "unitPrice", v)} min={0} className="w-full" />
                      </td>
                      <td className="py-2 px-2">
                        <Input type="number" value={String(item.discountPercent)} onChange={(e) => updateItem(idx, "discountPercent", (Number.isFinite(Number(e.target.value)) ? Number(e.target.value) : 0))} min={0} max={100} step={0.01} className="w-full" />
                      </td>
                      <td className="py-2 px-2">
                        <Input type="number" value={String(item.taxPercent)} onChange={(e) => updateItem(idx, "taxPercent", (Number.isFinite(Number(e.target.value)) ? Number(e.target.value) : 0))} min={0} max={100} step={0.01} className="w-full" />
                      </td>
                      <td className="py-2 px-2 text-right font-medium">{calcLineTotal(item).toLocaleString("id-ID")}</td>
                      <td className="py-2 px-2 text-center">
                        {billItems.length > 1 && (
                          <Button onPress={() => removeItem(idx)} className="p-1.5 rounded-md text-danger hover:bg-danger/10 transition-all">
                            <Trash2 size={14} />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-default">
                    <td colSpan={5} className="text-right py-2 px-2 text-sm text-secondary">Subtotal</td>
                    <td className="text-right py-2 px-2 font-medium">{subtotal.toLocaleString("id-ID")}</td>
                    <td></td>
                  </tr>
                  {totalDiscount > 0 && (
                    <tr>
                      <td colSpan={5} className="text-right py-1 px-2 text-sm text-secondary">Diskon</td>
                      <td className="text-right py-1 px-2 text-danger">-{totalDiscount.toLocaleString("id-ID")}</td>
                      <td></td>
                    </tr>
                  )}
                  {totalTax > 0 && (
                    <tr>
                      <td colSpan={5} className="text-right py-1 px-2 text-sm text-secondary">Pajak</td>
                      <td className="text-right py-1 px-2">{totalTax.toLocaleString("id-ID")}</td>
                      <td></td>
                    </tr>
                  )}
                  <tr>
                    <td colSpan={5} className="text-right py-2 px-2 text-sm font-semibold">Grand Total</td>
                    <td className="text-right py-2 px-2 font-bold text-primary">{grandTotal.toLocaleString("id-ID")}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </FormSection>

        <FormSection title="Lainnya" columns={1}>
          <FormAttachmentUpload referenceType="vendor_bill" />
        </FormSection>

        <FormActions>
          <Button onPress={() => router.back()}>Batal</Button>
          <Button type="submit" variant="primary" isDisabled={isPending}>
            {isPending ? "Menyimpan..." : bill?.id ? "Update" : "Simpan"}
          </Button>
        </FormActions>
      </FormCard>
    </form>
  )
}
