"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition, useMemo } from "react"
import { createBomRevision, updateBomRevision } from "@/actions/manufacturing.actions"
import { Plus, Trash2 } from "lucide-react"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { Combobox } from "@/components/ui/combobox"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { Button } from "@/components/ui/button"

interface RevisionRow {
  itemId: string
  qty: string
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
  materials: { itemId: number; qty: number }[]
}

/**
 * Form to create a BOM revision (snapshot of the product's working BOM) or to
 * edit a draft revision's lines. On creation the product's current BOM lines
 * are snapshotted automatically; the user may then adjust the draft lines.
 */
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

  const [productId, setProductId] = useState<number | null>(revision?.productId ?? null)
  const [lines, setLines] = useState<RevisionRow[]>(
    revision && revision.materials.length > 0
      ? revision.materials.map((m) => ({ itemId: String(m.itemId), qty: String(m.qty) }))
      : [{ itemId: "", qty: "" }],
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
    setLines([...lines, { itemId: "", qty: "" }])
  }
  function removeLine(index: number) {
    setLines(lines.filter((_, i) => i !== index))
  }
  function updateLine(index: number, field: keyof RevisionRow, value: string) {
    const updated = [...lines]
    updated[index][field] = value
    setLines(updated)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)

    if (!revision && productId) formData.set("productId", String(productId))
    lines.forEach((l) => {
      if (l.itemId && l.qty) {
        formData.append("revisionItemId", l.itemId)
        formData.append("revisionQty", l.qty)
      }
    })

    startTransition(async () => {
      const result = revision
        ? await updateBomRevision(revision.id, formData)
        : await createBomRevision(formData)
      if (result && !result.success) {
        showError(result.error || "Gagal menyimpan data")
        return
      }
      showSuccess(revision ? "Revisi BOM diperbarui" : "Revisi BOM dibuat")
      router.push("/produksi/bom-revisi")
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface rounded-xl border border-default shadow-sm p-6">
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
              ? `Revisi #${revision.revisionNo} — draft`
              : "BOM yang sedang berlaku akan disalin sebagai titik awal revisi ini."}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="effectiveDate">Tanggal Berlaku</Label>
          <Input
            id="effectiveDate"
            name="effectiveDate"
            type="date"
            defaultValue={revision?.effectiveDate ? revision.effectiveDate.slice(0, 10) : ""}
          />
        </div>

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
          <h3 className="form-section-title">Material (BOM Revisi)</h3>
          <Button onPress={addLine} aria-label="Tambah material" type="button">
            <Plus size={14} /> Tambah Material
          </Button>
        </div>

        <div className="overflow-x-auto">
          <DetailTable>
            <DetailTableHead>
              <DetailTableTh>Barang</DetailTableTh>
              <DetailTableTh>Jml</DetailTableTh>
              <DetailTableTh>Aksi</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {lines.map((m, index) => (
                <DetailTableRow key={index}>
                  <DetailTableTd>
                    <Combobox
                      value={m.itemId || null}
                      onChange={(key) => updateLine(index, "itemId", key ?? "")}
                      placeholder="Cari barang..."
                      options={itemOptions}
                    />
                  </DetailTableTd>
                  <DetailTableTd>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        step="0.01"
                        value={m.qty}
                        onChange={(e) => updateLine(index, "qty", e.target.value)}
                        placeholder="Jml"
                      />
                      <span className="shrink-0 text-sm font-medium text-muted-foreground min-w-[2.5rem]">
                        {m.itemId ? (uomById.get(m.itemId) ?? "") : ""}
                      </span>
                    </div>
                  </DetailTableTd>
                  <DetailTableTd>
                    <Button
                      onPress={() => removeLine(index)}
                      aria-label="Hapus material"
                      type="button"
                      isDisabled={lines.length === 1}
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
        <Button type="submit" variant="primary" isDisabled={isPending || (!revision && !productId)} id="submit-bom-revision">
          {isPending ? "Menyimpan..." : "Simpan"}
        </Button>
      </div>
    </form>
  )
}
