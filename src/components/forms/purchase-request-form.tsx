// @ts-nocheck
"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { createPurchaseRequest, updatePurchaseRequest } from "@/actions/purchase.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Plus, Trash2 } from "lucide-react"
import { AppDatePicker } from "@/components/ui/date-picker"
import { Input, ComboBox, ListBox, Label, TextArea } from "@heroui/react"

interface PRFormProps {
  items: { id: number; sku: string; name: string; unitOfMeasure: string }[]
  employees: { id: number; name: string }[]
  request?: any
}

interface PRItem { itemId: number; qty: number; notes: string }

export function PurchaseRequestForm({ items, employees, request }: PRFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [title, setTitle] = useState(request?.title || "")
  const [requestedBy, setRequestedBy] = useState<string>(request?.requestedBy ? String(request.requestedBy) : "")
  const [date, setDate] = useState(request?.date ? new Date(request.date).toISOString().split("T")[0] : new Date().toISOString().split("T")[0])
  const [notes, setNotes] = useState(request?.notes || "")
  const [prItems, setPrItems] = useState<PRItem[]>(
    request?.items?.map((i: any) => ({ itemId: i.itemId, qty: Number(i.qty), notes: i.notes || "" })) || [{ itemId: 0, qty: 1, notes: "" }]
  )

  function addItem() { setPrItems([...prItems, { itemId: 0, qty: 1, notes: "" }]) }
  function removeItem(i: number) { setPrItems(prItems.filter((_, idx) => idx !== i)) }
  function updateItem(i: number, field: keyof PRItem, value: any) {
    const updated = [...prItems]; updated[i] = { ...updated[i], [field]: value }; setPrItems(updated)
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!requestedBy) {
      showError("Pilih pemohon terlebih dahulu")
      return
    }
    startTransition(async () => {
      try {
        const formData = new FormData()
        formData.append("title", title)
        formData.append("requestedBy", requestedBy)
        formData.append("date", date)
        formData.append("notes", notes)
        formData.append("items", JSON.stringify(prItems))
        request?.id ? await updatePurchaseRequest(request.id, formData) : await createPurchaseRequest(formData)
        showSuccess(request?.id ? "Data berhasil diupdate" : "Data berhasil ditambahkan")
        router.push("/purchase/requests")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan data")
      }
    })
  }

  return (
    <form onSubmit={onSubmit} className="form-card bg-surface rounded-xl border border-default shadow-sm p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-6">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="title">Judul Permintaan</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Judul purchase request (opsional)"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <ComboBox
            name="requestedBy"
            selectedKey={requestedBy || null}
            onSelectionChange={(key) => setRequestedBy(key ? String(key) : "")}
            className="w-full"
            isRequired
          >
            <Label>Pemohon *</Label>
            <ComboBox.InputGroup><Input placeholder="Cari pemohon..." /><ComboBox.Trigger /></ComboBox.InputGroup>
            <ComboBox.Popover>
              <ListBox>
                {employees.map((emp) => (
                  <ListBox.Item key={emp.id} id={String(emp.id)} textValue={emp.name}>{emp.name}</ListBox.Item>
                ))}
              </ListBox>
            </ComboBox.Popover>
          </ComboBox>
        </div>
        <div className="flex flex-col gap-1.5">
          <AppDatePicker label="Tanggal *" name="date" value={date} onChange={setDate} required />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="notes">Catatan</Label>
          <TextArea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Catatan tambahan (opsional)"
            rows={3}
          />
        </div>
      </div>

      <div className="mt-4">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-base font-semibold text-foreground">Items yang Dibutuhkan</h3>
          <button
            type="button"
            onClick={addItem}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-all"
          >
            <Plus size={14} /> Tambah Item
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-default">
                <th className="text-left py-2 px-2 font-medium text-secondary" style={{ minWidth: "250px" }}>Item *</th>
                <th className="text-left py-2 px-2 font-medium text-secondary" style={{ width: "100px" }}>Qty *</th>
                <th className="text-left py-2 px-2 font-medium text-secondary">Catatan</th>
                <th style={{ width: "50px" }}></th>
              </tr>
            </thead>
            <tbody>
              {prItems.map((item, i) => (
                <tr key={i} className="border-b border-default/50">
                  <td className="py-2 px-2">
                    <ComboBox
                      selectedKey={item.itemId ? String(item.itemId) : null}
                      onSelectionChange={(key) => updateItem(i, "itemId", key ? Number(key) : 0)}
                      className="w-full"
                      isRequired
                    >
                      <ComboBox.InputGroup><Input placeholder="Cari item..." /><ComboBox.Trigger /></ComboBox.InputGroup>
                      <ComboBox.Popover>
                        <ListBox>
                          {items.map((it) => (
                            <ListBox.Item key={it.id} id={String(it.id)} textValue={`${it.sku} - ${it.name}`}>
                              {it.sku} - {it.name} ({it.unitOfMeasure})
                            </ListBox.Item>
                          ))}
                        </ListBox>
                      </ComboBox.Popover>
                    </ComboBox>
                  </td>
                  <td className="py-2 px-2">
                    <Input
                      type="number"
                      min={1}
                      value={String(item.qty)}
                      onChange={(e) => updateItem(i, "qty", Number(e.target.value))}
                      className="w-full"
                      required
                    />
                  </td>
                  <td className="py-2 px-2">
                    <Input
                      type="text"
                      value={item.notes}
                      onChange={(e) => updateItem(i, "notes", e.target.value)}
                      className="w-full"
                      placeholder="Catatan item"
                    />
                  </td>
                  <td className="py-2 px-2 text-center">
                    {prItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItem(i)}
                        className="p-1.5 rounded-md text-danger hover:bg-danger/10 transition-all"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <button type="button" onClick={() => router.back()} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all">Batal</button>
        <button type="submit" disabled={isPending} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">{isPending ? "Menyimpan..." : request?.id ? "Update" : "Simpan"}</button>
      </div>
    </form>
  )
}
