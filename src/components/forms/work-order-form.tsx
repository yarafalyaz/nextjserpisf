"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { AppDatePicker } from "@/components/ui/date-picker"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input, TextArea, ComboBox, ListBox, Label } from "@heroui/react"
import { FormCard, FormSection, FormActions } from "@/components/ui/form-section"
import { Button } from "@/components/ui/page-header"

export function WorkOrderForm({ customers, items, workOrder, quotationId, defaultCustomerId }: { customers: { id: number; name: string }[]; items: { id: number; sku: string; name: string; cost: string }[]; workOrder?: { id: number; customerId: number; quotationId?: number | null; projectId?: number | null; date: string; notes?: string | null; items?: Array<{ itemId: number; qty: number; unitPrice: number }> }; quotationId?: number; defaultCustomerId?: number }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [date, setDate] = useState(new Date().toISOString().split("T")[0])
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [woItems, setWoItems] = useState([{ itemId: 0, qty: 1, cost: 0, description: "", status: "pending" }])

  function addItem() { setWoItems([...woItems, { itemId: 0, qty: 1, cost: 0, description: "", status: "pending" }]) }
  function removeItem(i: number) { setWoItems(woItems.filter((_, idx) => idx !== i)) }
  function updateItem(i: number, field: string, value: string | number) {
    const updated = [...woItems]; updated[i] = { ...updated[i], [field]: value }
    if (field === "itemId") { const it = items.find((x) => x.id === Number(value)); if (it) updated[i].cost = Number(it.cost) }
    setWoItems(updated)
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget)
        formData.append("items", JSON.stringify(woItems))
        const { createWorkOrder, updateWorkOrder } = await import("@/actions/inventory.actions")
        workOrder?.id ? await updateWorkOrder(workOrder.id, formData) : await createWorkOrder(formData)
        showSuccess(workOrder?.id ? "Data berhasil diupdate" : "Data berhasil ditambahkan")
        router.push("/produksi/perintah-kerja")
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
            <ComboBox name="customerId" className="w-full" isRequired>
              <Label>Customer *</Label>
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
            <AppDatePicker
              label="Tanggal"
              name="date"
              value={date}
              onChange={(val) => setDate(val)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <AppDatePicker
              label="Tanggal Mulai"
              name="startDate"
              value={startDate}
              onChange={(val) => setStartDate(val)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <AppDatePicker
              label="Tanggal Selesai"
              name="endDate"
              value={endDate}
              onChange={(val) => setEndDate(val)}
            />
          </div>
        </FormSection>

        <FormSection title="Catatan" columns={1}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Catatan</Label>
            <TextArea id="notes" name="notes" rows={2} placeholder="Catatan work order..." defaultValue={workOrder?.notes ?? ""} />
          </div>
        </FormSection>

        <FormSection title="Item" columns={1}>
          <div>
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-base font-semibold text-foreground">Materials</h3>
              <Button onPress={addItem} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-all">+ Tambah</Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-default">
                    <th className="text-left py-2 px-2 font-medium text-secondary" style={{ minWidth: "200px" }}>Item</th>
                    <th className="text-left py-2 px-2 font-medium text-secondary" style={{ width: "80px" }}>Qty</th>
                    <th className="text-right py-2 px-2 font-medium text-secondary" style={{ width: "100px" }}>Cost</th>
                    <th className="text-right py-2 px-2 font-medium text-secondary" style={{ width: "120px" }}>Total</th>
                    <th className="text-left py-2 px-2 font-medium text-secondary">Deskripsi</th>
                    <th className="text-left py-2 px-2 font-medium text-secondary" style={{ width: "110px" }}>Status</th>
                    <th style={{ width: "40px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {woItems.map((item, i) => (
                    <tr key={i} className="border-b border-default/50">
                      <td className="py-2 px-2">
                        <select value={item.itemId} onChange={(e) => updateItem(i, "itemId", Number(e.target.value))} className="form-input" style={{ fontSize: "0.8125rem", padding: "6px" }}>
                          <option value={0}>Pilih</option>
                          {items.map((it) => <option key={it.id} value={it.id}>{it.sku} - {it.name}</option>)}
                        </select>
                      </td>
                      <td className="py-2 px-2">
                        <input type="number" min={1} value={item.qty} onChange={(e) => updateItem(i, "qty", Number(e.target.value))} className="form-input" style={{ fontSize: "0.8125rem", padding: "6px", width: "80px" }} />
                      </td>
                      <td className="py-2 px-2 text-right">Rp {item.cost.toLocaleString("id-ID")}</td>
                      <td className="py-2 px-2 text-right">Rp {(item.qty * item.cost).toLocaleString("id-ID")}</td>
                      <td className="py-2 px-2">
                        <input type="text" value={item.description} onChange={(e) => updateItem(i, "description", e.target.value)} className="form-input" style={{ fontSize: "0.8125rem", padding: "6px" }} placeholder="Deskripsi..." />
                      </td>
                      <td className="py-2 px-2">
                        <select value={item.status} onChange={(e) => updateItem(i, "status", e.target.value)} className="form-input" style={{ fontSize: "0.8125rem", padding: "6px" }}>
                          <option value="pending">Pending</option>
                          <option value="in_progress">In Progress</option>
                          <option value="completed">Completed</option>
                        </select>
                      </td>
                      <td className="py-2 px-2 text-center">
                        {woItems.length > 1 && (
                          <Button onPress={() => removeItem(i)} className="p-1.5 rounded-md text-danger hover:bg-danger/10 transition-all">×</Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </FormSection>

        <FormActions>
          <Button onPress={() => router.back()}>Batal</Button>
          <Button type="submit" variant="primary" isDisabled={isPending}>
            {isPending ? "Menyimpan..." : workOrder?.id ? "Update" : "Simpan"}
          </Button>
        </FormActions>
      </FormCard>
    </form>
  )
}
