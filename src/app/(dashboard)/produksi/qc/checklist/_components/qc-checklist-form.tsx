"use client"

import { useRouter } from "next/navigation"
import { useCallback, useMemo, useRef, useState, useTransition } from "react"
import { createQcChecklist, updateQcChecklist } from "@/actions/qc.actions"
import { Plus, Trash2 } from "@/components/ui/fontawesome-icons"
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
import { DataTable } from "@/components/ui/data-table"
import { createColumnHelper } from "@/lib/table"
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
  { value: "incoming", label: "Penerimaan" },
  { value: "in_process", label: "Proses" },
  { value: "final", label: "Akhir" },
  { value: "safety", label: "Keselamatan (K3)" },
]

const METHOD_OPTIONS = [
  { value: "visual", label: "Visual" },
  { value: "measure", label: "Ukur" },
  { value: "torque", label: "Torsi" },
  { value: "test", label: "Uji" },
  { value: "functional", label: "Fungsional" },
]

interface ItemTableRow extends ItemRow {
  id: number
}

const checklistColumnHelper = createColumnHelper<ItemTableRow>()

export function QcChecklistForm({
  products,
  checklist,
}: {
  products: ProductOption[]
  checklist?: QcChecklistEdit
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  // Putaran 68: key stabil per intent create; retry memakai key sama
  // (ditolak server). Dikirim hanya saat create; sukses bernavigasi pergi.
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID())

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
    setRows((prev) => [...prev, { itemName: "", method: "visual", spec: "", isRequired: true }])
  }
  const removeRow = useCallback((index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index))
  }, [])
  const updateRow = useCallback((index: number, field: keyof ItemRow, value: string | boolean) => {
    setRows((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
  }, [])

  const tableData = useMemo<ItemTableRow[]>(
    () => rows.map((r, index) => ({ ...r, id: index })),
    [rows],
  )

  const columns = useMemo(
    () => [
      checklistColumnHelper.accessor("itemName", {
        header: "Butir",
        meta: { mobilePrimary: true },
        cell: (info) => {
          const index = info.row.original.id
          return (
            <Input
              value={info.getValue()}
              onChange={(e) => updateRow(index, "itemName", e.target.value)}
              placeholder="Nama butir"
            />
          )
        },
      }),
      checklistColumnHelper.accessor("method", {
        header: "Metode",
        cell: (info) => {
          const index = info.row.original.id
          return (
            <Select value={info.getValue()} onValueChange={(v) => updateRow(index, "method", v)}>
              <SelectTrigger aria-label="Metode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METHOD_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )
        },
      }),
      checklistColumnHelper.accessor("spec", {
        header: "Spesifikasi",
        cell: (info) => {
          const index = info.row.original.id
          return (
            <Input
              value={info.getValue()}
              onChange={(e) => updateRow(index, "spec", e.target.value)}
              placeholder="Target/toleransi"
            />
          )
        },
      }),
      checklistColumnHelper.accessor("isRequired", {
        header: "Wajib",
        cell: (info) => {
          const index = info.row.original.id
          return (
            <input
              type="checkbox"
              checked={info.getValue()}
              onChange={(e) => updateRow(index, "isRequired", e.target.checked)}
              aria-label="Butir wajib"
              className="size-4"
            />
          )
        },
      }),
      checklistColumnHelper.display({
        id: "actions",
        header: "Aksi",
        meta: { align: "right" },
        cell: (info) => {
          const index = info.row.original.id
          return (
            <Button
              onPress={() => removeRow(index)}
              aria-label={`Hapus butir baris ${index + 1}`}
              type="button"
              isDisabled={rows.length === 1}
            >
              <Trash2 size={14} />
            </Button>
          )
        },
      }),
    ],
    [removeRow, rows.length, updateRow],
  )

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    if (!checklist) formData.set("idempotencyKey", idempotencyKeyRef.current)
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
    <form onSubmit={handleSubmit} className="bg-surface rounded-xl border border-default shadow-sm p-4 sm:p-6">
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
          <h3 className="form-section-title">Butir Checklist</h3>
          <Button onPress={addRow} aria-label="Tambah butir" type="button">
            <Plus size={14} /> Tambah Butir
          </Button>
        </div>

        <DataTable
          data={tableData}
          columns={columns}
          ariaLabel="Butir Checklist"
          selectable={false}
          enableColumnToggle={false}
          enableExport={false}
          pageSize={50}
        />
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3 mt-6 pt-5 border-t border-default">
        <Button className="w-full sm:w-auto" onPress={() => router.back()} type="button">Batal</Button>
        <Button className="w-full sm:w-auto" type="submit" variant="primary" isDisabled={isPending} id="submit-qc-checklist">
          {isPending ? "Menyimpan..." : "Simpan"}
        </Button>
      </div>
    </form>
  )
}
