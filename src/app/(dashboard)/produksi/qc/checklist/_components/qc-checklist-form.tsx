"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { createQcChecklist, updateQcChecklist } from "@/actions/qc.actions"
import { Plus, Trash2 } from "lucide-react"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Combobox } from "@/components/ui/combobox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/shadcn/select"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { Button } from "@/components/ui/button"

interface ItemRow {
  itemName: string
  method: string
  spec: string
  isRequired: boolean
}

interface ProductOption {
  id: number
  name: string
}

interface QcChecklistEdit {
  id: number
  code: string | null
  name: string
  checklistType: string
  productId: number | null
  items: { itemName: string; method: string; spec: string | null; isRequired: boolean }[]
}

const TYPE_OPTIONS = [
  { value: "incoming", label: "Penerimaan (incoming)" },
  { value: "in_process", label: "Proses (in-process)" },
  { value: "final", label: "Akhir (final)" },
  { value: "safety", label: "Keselamatan (safety/K3)" },
]

const METHOD_OPTIONS = [
  { value: "visual", label: "Visual" },
  { value: "measure", label: "Ukur" },
  { value: "torque", label: "Torsi" },
  { value: "test", label: "Uji" },
  { value: "functional", label: "Fungsional" },
]

export function QcChecklistForm({
  products,
  checklist,
}: {
  products: ProductOption[]
  checklist?: QcChecklistEdit
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [checklistType, setChecklistType] = useState(checklist?.checklistType ?? "incoming")
  const [productId, setProductId] = useState<number | null>(checklist?.productId ?? null)
  const [rows, setRows] = useState<ItemRow[]>(
    checklist && checklist.items.length > 0
      ? checklist.items.map((it) => ({
          itemName: it.itemName,
          method: it.method,
          spec: it.spec ?? "",
          isRequired: it.isRequired,
        }))
      : [{ itemName: "", method: "visual", spec: "", isRequired: true }],
  )

  function addRow() {
    setRows([...rows, { itemName: "", method: "visual", spec: "", isRequired: true }])
  }
  function removeRow(index: number) {
    setRows(rows.filter((_, i) => i !== index))
  }
  function updateRow(index: number, field: keyof ItemRow, value: string | boolean) {
    const updated = [...rows]
    updated[index] = { ...updated[index], [field]: value }
    setRows(updated)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    formData.set("checklistType", checklistType)
    if (productId) formData.set("productId", String(productId))
    else formData.delete("productId")

    rows.forEach((r) => {
      if (r.itemName.trim()) {
        formData.append("itemName", r.itemName)
        formData.append("itemMethod", r.method)
        formData.append("itemSpec", r.spec)
        formData.append("itemRequired", r.isRequired ? "true" : "false")
      }
    })

    startTransition(async () => {
      const result = checklist
        ? await updateQcChecklist(checklist.id, formData)
        : await createQcChecklist(formData)
      if (result && !result.success) {
        showError(result.error || "Gagal menyimpan data")
        return
      }
      showSuccess(checklist ? "Checklist diperbarui" : "Checklist dibuat")
      router.push("/produksi/qc/checklist")
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface rounded-xl border border-default shadow-sm p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Nama Checklist *</Label>
          <Input id="name" name="name" defaultValue={checklist?.name ?? ""} required maxLength={200} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="code">Kode</Label>
          <Input id="code" name="code" defaultValue={checklist?.code ?? ""} maxLength={100} placeholder="Otomatis bila kosong" />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="checklistType">Jenis Inspeksi *</Label>
          <Select value={checklistType} onValueChange={setChecklistType}>
            <SelectTrigger id="checklistType">
              <SelectValue placeholder="Pilih jenis" />
            </SelectTrigger>
            <SelectContent>
              {TYPE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="product">Produk (opsional)</Label>
          <Combobox
            id="product"
            value={productId ? String(productId) : null}
            onChange={(key) => setProductId(key ? Number(key) : null)}
            placeholder="Berlaku umum bila kosong"
            options={products.map((p) => ({ value: String(p.id), label: p.name }))}
          />
          <p className="text-xs text-muted-foreground">
            Bila kosong, checklist berlaku untuk semua produk.
          </p>
        </div>
      </div>

      <div className="form-section">
        <div className="form-section-header">
          <h3 className="form-section-title">Item Checklist</h3>
          <Button onPress={addRow} aria-label="Tambah item" type="button">
            <Plus size={14} /> Tambah Item
          </Button>
        </div>

        <div className="overflow-x-auto">
          <DetailTable>
            <DetailTableHead>
              <DetailTableTh>Item</DetailTableTh>
              <DetailTableTh>Metode</DetailTableTh>
              <DetailTableTh>Spesifikasi</DetailTableTh>
              <DetailTableTh>Wajib</DetailTableTh>
              <DetailTableTh>Aksi</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {rows.map((r, index) => (
                <DetailTableRow key={index}>
                  <DetailTableTd>
                    <Input
                      value={r.itemName}
                      onChange={(e) => updateRow(index, "itemName", e.target.value)}
                      placeholder="Nama item"
                    />
                  </DetailTableTd>
                  <DetailTableTd>
                    <Select value={r.method} onValueChange={(v) => updateRow(index, "method", v)}>
                      <SelectTrigger aria-label="Metode">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {METHOD_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </DetailTableTd>
                  <DetailTableTd>
                    <Input
                      value={r.spec}
                      onChange={(e) => updateRow(index, "spec", e.target.value)}
                      placeholder="Target/toleransi"
                    />
                  </DetailTableTd>
                  <DetailTableTd>
                    <input
                      type="checkbox"
                      checked={r.isRequired}
                      onChange={(e) => updateRow(index, "isRequired", e.target.checked)}
                      aria-label="Item wajib"
                      className="size-4"
                    />
                  </DetailTableTd>
                  <DetailTableTd>
                    <Button
                      onPress={() => removeRow(index)}
                      aria-label="Hapus item"
                      type="button"
                      isDisabled={rows.length === 1}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </DetailTableTd>
                </DetailTableRow>
              ))}
            </DetailTableBody>
          </DetailTable>
        </div>
      </div>

      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <Button onPress={() => router.back()} type="button">Batal</Button>
        <Button type="submit" variant="primary" isDisabled={isPending} id="submit-qc-checklist">
          {isPending ? "Menyimpan..." : "Simpan"}
        </Button>
      </div>
    </form>
  )
}
