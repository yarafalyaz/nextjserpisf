"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { AppDatePicker } from "@/components/ui/date-picker"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { Combobox } from "@/components/ui/combobox"
import { FormCard, FormSection, FormActions } from "@/components/ui/form-section"
import { Button } from "@/components/ui/page-header"

export function WorkOrderForm({ customers, items, workOrder, quotationId: _quotationId, defaultCustomerId: _defaultCustomerId }: { customers: { id: number; name: string }[]; items: { id: number; sku: string; name: string; cost: string }[]; workOrder?: { id: number; customerId: number; quotationId?: number | null; projectId?: number | null; date: string; notes?: string | null; items?: Array<{ itemId: number; qty: number; unitPrice: number }> }; quotationId?: number; defaultCustomerId?: number }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [date, setDate] = useState(new Date().toISOString().split("T")[0])
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [customerId, setCustomerId] = useState<string | null>(workOrder?.customerId ? String(workOrder.customerId) : null)
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
        const result = workOrder?.id
          ? await updateWorkOrder(workOrder.id, formData)
          : await createWorkOrder(formData)
        if (result && !result.success) { showError(result.error || "Gagal menyimpan data"); return }
        showSuccess(workOrder?.id ? "Data berhasil diperbarui" : "Data berhasil ditambahkan")
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
            <Label htmlFor="customerId">Pelanggan *</Label>
            <Combobox
              id="customerId"
              name="customerId"
              options={customers.map((c) => ({ value: String(c.id), label: c.name }))}
              value={customerId}
              onChange={setCustomerId}
              placeholder="Cari pelanggan..."
            />
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
            <Textarea id="notes" name="notes" rows={2} placeholder="Catatan perintah kerja..." defaultValue={workOrder?.notes ?? ""} />
          </div>
        </FormSection>

        <FormSection title="Item" columns={1}>
          <div>
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-base font-semibold text-foreground">Bahan</h3>
              <Button type="button" onPress={addItem} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-all">+ Tambah</Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-default">
                    <th className="text-left py-2 px-2 font-medium text-secondary" style={{ minWidth: "200px" }}>Item</th>
                    <th className="text-left py-2 px-2 font-medium text-secondary" style={{ width: "80px" }}>Jml</th>
                    <th className="text-right py-2 px-2 font-medium text-secondary" style={{ width: "100px" }}>Biaya</th>
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
                        <Combobox
                          value={item.itemId ? String(item.itemId) : null}
                          onChange={(key) => updateItem(i, "itemId", key ? Number(key) : 0)}
                          placeholder="Pilih"
                          className="w-full"
                          options={items.map((it) => ({ value: String(it.id), label: `${it.sku} - ${it.name}` }))}
                        />
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
                        <Combobox
                          value={item.status}
                          onChange={(key) => updateItem(i, "status", key ?? "")}
                          placeholder="Cari status..."
                          className="w-full"
                          options={[
                            { value: "pending", label: "Menunggu" },
                            { value: "in_progress", label: "Dikerjakan" },
                            { value: "completed", label: "Selesai" },
                          ]}
                        />
                      </td>
                      <td className="py-2 px-2 text-center">
                        {woItems.length > 1 && (
                          <Button type="button" onPress={() => removeItem(i)} className="p-1.5 rounded-md text-danger hover:bg-danger/10 transition-all">×</Button>
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
            {isPending ? "Menyimpan..." : workOrder?.id ? "Perbarui" : "Simpan"}
          </Button>
        </FormActions>
      </FormCard>
    </form>
  )
}
