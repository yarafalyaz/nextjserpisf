"use client"

import { useRouter } from "next/navigation"
import { useCallback, useRef, useState, useTransition, useMemo } from "react"
import { createBomRevision, updateBomRevision } from "@/actions/manufacturing.actions"
import { Plus, Trash2 } from "@/components/ui/fontawesome-icons"
import { showSuccess, showError } from "@/lib/utils/toast"
import { runUiAction } from "@/components/ui/async-action"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { AppDatePicker } from "@/components/ui/date-picker"
import { Combobox } from "@/components/ui/combobox"
import { DataTable } from "@/components/ui/data-table"
import { createColumnHelper } from "@/lib/table"
import { Button } from "@/components/ui/button"
import { FormActions } from "@/components/ui/form-section"

function sanitizeNonNegativeDecimal(raw: string): string {
  const normalized = raw.replace(/,/g, ".").replace(/[^0-9.]/g, "")
  const dotIndex = normalized.indexOf(".")
  return dotIndex === -1
    ? normalized
    : normalized.slice(0, dotIndex + 1) + normalized.slice(dotIndex + 1).replace(/\./g, "")
}

interface RevisionRow {
  itemId: string
  qty: string
  scrapPercent: string
}

interface ProductOption {
  id: number
  name: string
}

interface ItemOption {
  id: number
  sku: string
  name: string
  unitOfMeasure: string
}

interface BomRevisionEdit {
  id: number
  revisionNo: number
  productId: number
  effectiveDate: string
  notes: string | null
  materials: { itemId: number; qty: number; scrapPercent?: number | null }[]
}

/**
 * Form to create a BOM revision (snapshot of the product's working BOM) or to
 * edit a draft revision's lines. On creation the product's current BOM lines
 * are snapshotted automatically; the user may then adjust the draft lines.
 */
interface RevisionTableRow extends RevisionRow {
  id: number
}

const bomColumnHelper = createColumnHelper<RevisionTableRow>()

export function BomRevisionForm({
  products,
  items,
  revision,
}: {
  products: ProductOption[]
  items: ItemOption[]
  revision?: BomRevisionEdit
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID())

  const [productId, setProductId] = useState<number | null>(revision?.productId ?? null)
  const [lines, setLines] = useState<RevisionRow[]>(
    revision && revision.materials.length > 0
      ? revision.materials.map((m) => ({ itemId: String(m.itemId), qty: String(m.qty), scrapPercent: m.scrapPercent != null ? String(m.scrapPercent) : "" }))
      : [{ itemId: "", qty: "", scrapPercent: "" }],
  )

  const itemOptions = useMemo(
    () => items.map((it) => ({ value: String(it.id), label: `${it.sku} - ${it.name}` })),
    [items],
  )
  const uomById = useMemo(() => {
    const map = new Map<string, string>()
    items.forEach((it) => map.set(String(it.id), it.unitOfMeasure))
    return map
  }, [items])

  function addLine() {
    setLines((prev) => [...prev, { itemId: "", qty: "", scrapPercent: "" }])
  }
  const removeLine = useCallback((index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index))
  }, [])
  const updateLine = useCallback((index: number, field: keyof RevisionRow, value: string) => {
    setLines((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
  }, [])

  const tableData = useMemo<RevisionTableRow[]>(
    () => lines.map((l, index) => ({ ...l, id: index })),
    [lines],
  )

  const columns = useMemo(
    () => [
      bomColumnHelper.accessor("itemId", {
        header: "Barang",
        enableSorting: false,
        meta: { mobilePrimary: true },
        cell: (info) => {
          const index = info.row.original.id
          return (
            <Combobox
              value={info.getValue() || null}
              onChange={(key) => updateLine(index, "itemId", key ?? "")}
              placeholder="Cari barang..."
              options={itemOptions}
            />
          )
        },
      }),
      bomColumnHelper.accessor("qty", {
        header: "Jml",
        enableSorting: false,
        cell: (info) => {
          const m = info.row.original
          const index = m.id
          return (
            <div className="flex items-center gap-2">
              <Input
                type="text"
                inputMode="decimal"
                value={m.qty}
                onChange={(e) => updateLine(index, "qty", sanitizeNonNegativeDecimal(e.target.value))}
                placeholder="0"
                className="font-mono tabular-nums"
              />
              <span className="shrink-0 text-sm font-medium text-muted-foreground min-w-[2.5rem]">
                {m.itemId ? (uomById.get(m.itemId) ?? "") : ""}
              </span>
            </div>
          )
        },
      }),
      bomColumnHelper.display({
        id: "actions",
        header: "Aksi",
        enableSorting: false,
        meta: { align: "right" },
        cell: (info) => {
          const index = info.row.original.id
          return (
            <Button
              onPress={() => removeLine(index)}
              aria-label={`Hapus bahan baris ${index + 1}`}
              type="button"
              isDisabled={lines.length === 1}
            >
              <Trash2 size={14} />
            </Button>
          )
        },
      }),
    ],
    [itemOptions, lines.length, removeLine, uomById, updateLine],
  )

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)

    if (!revision && productId) formData.set("productId", String(productId))
    if (!revision) formData.set("idempotencyKey", idempotencyKeyRef.current)
    for (const l of lines) {
      if (l.itemId) {
        const qtyNum = Number(l.qty)
        if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
          showError("Jumlah bahan (BOM) harus lebih besar dari 0")
          return
        }
        if (l.scrapPercent !== "") {
          const scrapNum = Number(l.scrapPercent)
          if (!Number.isFinite(scrapNum) || scrapNum < 0 || scrapNum > 100) {
            showError("Scrap % (allowance) harus di antara 0 sampai 100")
            return
          }
        }
        formData.append("revisionItemId", l.itemId)
        formData.append("revisionQty", l.qty)
        formData.append("revisionScrapPercent", l.scrapPercent)
      }
    }

    startTransition(async () => {
      await runUiAction(async () => {
        const result = revision
          ? await updateBomRevision(revision.id, formData)
          : await createBomRevision(formData)
        if (result && !result.success) {
          showError(result.error || "Gagal menyimpan data")
          return
        }
        if (!revision) idempotencyKeyRef.current = crypto.randomUUID()
        showSuccess(revision ? "Revisi BOM diperbarui" : "Revisi BOM dibuat")
        router.push("/produksi/bom-revisi")
        router.refresh()
      }, "Gagal menyimpan data")
    })
  }

  return (
    <form onSubmit={handleSubmit} className="sm:bg-surface sm:rounded-xl sm:border sm:border-default sm:shadow-sm sm:p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="product">Produk *</Label>
          {revision ? (
            <Input
              id="product"
              value={products.find((p) => p.id === revision.productId)?.name ?? `#${revision.productId}`}
              readOnly
              className="bg-default-soft"
            />
          ) : (
            <Combobox
              id="product"
              value={productId ? String(productId) : null}
              onChange={(key) => setProductId(key ? Number(key) : null)}
              placeholder="Pilih produk..."
              options={products.map((p) => ({ value: String(p.id), label: p.name }))}
            />
          )}
          <p className="text-xs text-muted-foreground">
            {revision
              ? `Revisi #${revision.revisionNo} (draf)`
              : "BOM yang sedang berlaku akan disalin sebagai titik awal revisi ini."}
          </p>
        </div>

        <AppDatePicker
          label="Tanggal Berlaku"
          name="effectiveDate"
          defaultValue={revision?.effectiveDate ? revision.effectiveDate.slice(0, 10) : ""}
        />

        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="notes">Catatan</Label>
          <Textarea
            id="notes"
            name="notes"
            rows={3}
            placeholder="Alasan perubahan, referensi ECN, dsb. (opsional)"
            defaultValue={revision?.notes ?? ""}
          />
        </div>
      </div>

      <div className="form-section">
        <div className="form-section-header">
          <h3 className="form-section-title">Bahan (BOM Revisi)</h3>
          <Button onPress={addLine} aria-label="Tambah bahan" type="button">
            <Plus size={14} /> Tambah Bahan
          </Button>
        </div>

        <DataTable
          data={tableData}
          columns={columns}
          ariaLabel="Bahan BOM Revisi"
          selectable={false}
          enableColumnToggle={false}
          enableExport={false}
          showPagination={false}
          pageSize={50}
        />
      </div>

      <FormActions>
        <Button className="w-full sm:w-auto" onPress={() => router.back()} type="button">Batal</Button>
        <Button className="w-full sm:w-auto" type="submit" variant="primary" isDisabled={isPending || (!revision && !productId)} id="submit-bom-revision">
          {isPending ? "Menyimpan..." : "Simpan"}
        </Button>
      </FormActions>
    </form>
  )
}
