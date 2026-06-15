"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { createPurchaseRequest, updatePurchaseRequest } from "@/actions/purchase.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Plus, Trash2 } from "lucide-react"
import { AppDatePicker } from "@/components/ui/date-picker"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { Combobox } from "@/components/ui/combobox"
import { FormCard, FormSection, FormActions } from "@/components/ui/form-section"
import { Button } from "@/components/ui/button"

interface PRFormProps {
  items: { id: number; sku: string; name: string; unitOfMeasure: string }[]
  employees: { id: number; name: string }[]
  request?: { id: number; title?: string | null; date: string; departmentId?: number | null; requestedBy?: string | null; notes?: string | null; requestDate?: string | null; description?: string | null; items?: Array<{ itemId: number; qty: number; notes?: string }> }
}

interface PRItem { itemId: number; qty: number; notes: string }

export function PurchaseRequestForm({ items, employees, request }: PRFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [title, setTitle] = useState(request?.title || "")
  const [requestedBy, setRequestedBy] = useState<string>(request?.requestedBy ? String(request.requestedBy) : "")
  const [date, setDate] = useState(request?.date ? new Date(request.date).toISOString().split("T")[0] : new Date().toISOString().split("T")[0])
  const [notes, setNotes] = useState(request?.notes || "")
  const [requestDate, setRequestDate] = useState(request?.requestDate ? new Date(request.requestDate).toISOString().split("T")[0] : new Date().toISOString().split("T")[0])
  const [description, setDescription] = useState(request?.description || "")
  const [prItems, setPrItems] = useState<PRItem[]>(
    request?.items?.map((i: { itemId: number; qty: number; notes?: string }) => ({ itemId: i.itemId, qty: Number(i.qty), notes: i.notes || "" })) || [{ itemId: 0, qty: 1, notes: "" }]
  )

  function addItem() { setPrItems([...prItems, { itemId: 0, qty: 1, notes: "" }]) }
  function removeItem(i: number) { setPrItems(prItems.filter((_, idx) => idx !== i)) }
  function updateItem(i: number, field: keyof PRItem, value: string | number) {
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
        formData.append("requestDate", requestDate)
        formData.append("description", description)
        formData.append("items", JSON.stringify(prItems))
        if (request?.id) {

          await updatePurchaseRequest(request.id, formData)

        } else {

          await createPurchaseRequest(formData)

        }
        showSuccess(request?.id ? "Data berhasil diperbarui" : "Data berhasil ditambahkan")
        router.push("/pembelian/permintaan")
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
            <Label htmlFor="title">Judul Permintaan</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Judul permintaan pembelian (opsional)"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="requestedBy">Pemohon</Label>
            <Combobox
              id="requestedBy"
              name="requestedBy"
              value={requestedBy || null}
              onChange={(key) => setRequestedBy(key ?? "")}
              placeholder="Cari pemohon..."
              options={employees.map((emp) => ({ value: String(emp.id), label: emp.name }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <AppDatePicker label="Tanggal" name="date" value={date} onChange={setDate} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <AppDatePicker label="Tanggal Permintaan" name="requestDate" value={requestDate} onChange={setRequestDate} />
          </div>
        </FormSection>

        <FormSection title="Detail" columns={1}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Deskripsi</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Deskripsi permintaan (opsional)"
              rows={3}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Catatan</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Catatan tambahan (opsional)"
              rows={3}
            />
          </div>
        </FormSection>

        <FormSection title="Item" columns={1}>
          <div>
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-base font-semibold text-foreground">Item yang Dibutuhkan</h3>
              <Button
                type="button"
                onPress={addItem}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-all"
              >
                <Plus size={14} /> Tambah Item
              </Button>
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
                        <Combobox
                          value={item.itemId ? String(item.itemId) : null}
                          onChange={(key) => updateItem(i, "itemId", key ? Number(key) : 0)}
                          placeholder="Cari item..."
                          options={items.map((it) => ({ value: String(it.id), label: `${it.sku} - ${it.name} (${it.unitOfMeasure})` }))}
                        />
                      </td>
                      <td className="py-2 px-2">
                        <Input
                          type="number"
                          min="1"
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
                          <Button
                            type="button"
                            onPress={() => removeItem(i)}
                            className="p-1.5 rounded-md text-danger hover:bg-danger/10 transition-all"
                          >
                            <Trash2 size={14} />
                          </Button>
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
          <Button type="button" onPress={() => router.back()}>Batal</Button>
          <Button type="submit" variant="primary" isDisabled={isPending}>
            {isPending ? "Menyimpan..." : request?.id ? "Perbarui" : "Simpan"}
          </Button>
        </FormActions>
      </FormCard>
    </form>
  )
}
