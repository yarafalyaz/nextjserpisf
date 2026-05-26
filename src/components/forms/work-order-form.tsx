// @ts-nocheck
"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { AppDatePicker } from "@/components/ui/date-picker"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input, TextArea, ComboBox, ListBox, Label } from "@heroui/react"

export function WorkOrderForm({ customers, items, workOrder, quotationId, defaultCustomerId }: { customers: { id: number; name: string }[]; items: { id: number; sku: string; name: string; cost: string }[]; workOrder?: any; quotationId?: number; defaultCustomerId?: number }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [date, setDate] = useState(new Date().toISOString().split("T")[0])
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [woItems, setWoItems] = useState([{ itemId: 0, qty: 1, cost: 0 }])

  function addItem() { setWoItems([...woItems, { itemId: 0, qty: 1, cost: 0 }]) }
  function removeItem(i: number) { setWoItems(woItems.filter((_, idx) => idx !== i)) }
  function updateItem(i: number, field: string, value: any) {
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
        const { createWorkOrder } = await import("@/actions/inventory.actions")
        workOrder?.id ? await updateWorkOrder(workOrder.id, formData) : await createWorkOrder(formData)
        showSuccess(workOrder?.id ? "Data berhasil diupdate" : "Data berhasil ditambahkan")
        router.push("/manufacturing/work-orders")
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
        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="notes">Catatan</Label>
          <TextArea id="notes" name="notes" rows={2} placeholder="Catatan work order..." defaultValue={workOrder?.notes ?? ""} />
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
      </div>

      <div style={{ marginTop: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <h3 style={{ margin: 0, fontSize: "1rem" }}>Materials</h3>
          <button type="button" onClick={addItem} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium border border-transparent transition-all inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-default transition-all -secondary">+ Tambah</button>
        </div>
        <table className="w-full border-collapse" style={{ fontSize: "0.8125rem" }}>
          <thead><tr><th>Item</th><th>Qty</th><th>Cost</th><th>Total</th><th></th></tr></thead>
          <tbody>
            {woItems.map((item, i) => (
              <tr key={i}>
                <td><select value={item.itemId} onChange={(e) => updateItem(i, "itemId", Number(e.target.value))} className="form-input" style={{ fontSize: "0.8125rem", padding: "6px" }}><option value={0}>Pilih</option>{items.map((it) => <option key={it.id} value={it.id}>{it.sku} - {it.name}</option>)}</select></td>
                <td><input type="number" min={1} value={item.qty} onChange={(e) => updateItem(i, "qty", Number(e.target.value))} className="form-input" style={{ fontSize: "0.8125rem", padding: "6px", width: "80px" }} /></td>
                <td className="text-right">Rp {item.cost.toLocaleString("id-ID")}</td>
                <td className="text-right">Rp {(item.qty * item.cost).toLocaleString("id-ID")}</td>
                <td>{woItems.length > 1 && <button type="button" onClick={() => removeItem(i)} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium border border-transparent transition-all inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-default transition-all -ghost" style={{ color: "var(--color-danger)" }}>×</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <button type="button" onClick={() => router.back()} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all">Batal</button>
        <button type="submit" disabled={isPending} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">{isPending ? "Menyimpan..." : workOrder?.id ? "Update" : "Simpan"}</button>
      </div>
    </form>
  )
}
