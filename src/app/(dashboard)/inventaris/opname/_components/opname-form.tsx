"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { createStockAdjustment } from "@/actions/inventory.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { Label } from "@/components/ui/shadcn/label"
import { Button } from "@/components/ui/button"
import { FormCard, FormSection, FormActions } from "@/components/ui/form-section"
import { ReportSection } from "@/components/reports/report-section"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { formatAccounting } from "@/lib/utils/format"

interface OpnameRow {
  id: number
  sku: string
  name: string
  uom: string
  systemQty: number
  unitCost: number
}

interface OpnameFormProps {
  warehouseId: number
  date: string
  rows: OpnameRow[]
}

/**
 * Count sheet: every line is prefilled with the system quantity, so the operator
 * only edits the lines that differ. Only lines whose count differs from the
 * system quantity are submitted (the rest would be no-op adjustments).
 */
export function OpnameForm({ warehouseId, date, rows }: OpnameFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [counted, setCounted] = useState<Record<number, string>>(
    Object.fromEntries(rows.map((row) => [row.id, String(row.systemQty)])),
  )
  const [notes, setNotes] = useState("")

  const differing = rows.filter((row) => {
    const value = counted[row.id]
    if (value === undefined || value.trim() === "") return false
    return Number(value) !== row.systemQty
  })

  function onSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    if (differing.length === 0) {
      showError("Tidak ada selisih untuk disimpan")
      return
    }

    const items = differing.map((row) => ({
      itemId: row.id,
      newQty: Number(counted[row.id]),
      unitCost: row.unitCost,
      reason: "Hasil stok opname",
    }))

    const formData = new FormData()
    formData.set("warehouseId", String(warehouseId))
    formData.set("date", date)
    formData.set("reason", "Hasil stok opname")
    formData.set("notes", notes)
    formData.set("items", JSON.stringify(items))

    startTransition(async () => {
      try {
        const result = await createStockAdjustment(formData)
        if (!result?.success) {
          showError(result?.error ?? "Gagal menyimpan hasil opname")
          return
        }
        showSuccess(`Penyesuaian stok dibuat untuk ${items.length} barang. Lanjutkan posting di menu Penyesuaian.`)
        router.push("/inventaris/penyesuaian")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan hasil opname")
      }
    })
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <ReportSection title="Lembar Penghitungan">
        <DetailTable data-report-table="Lembar Penghitungan Stok">
          <DetailTableHead>
            <DetailTableTh>SKU</DetailTableTh>
            <DetailTableTh>Barang</DetailTableTh>
            <DetailTableTh>Satuan</DetailTableTh>
            <DetailTableTh align="right">Stok Sistem</DetailTableTh>
            <DetailTableTh align="right">Hasil Hitung</DetailTableTh>
            <DetailTableTh align="right">Selisih</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {rows.map((row) => {
              const raw = counted[row.id]
              const value = raw === undefined || raw.trim() === "" ? null : Number(raw)
              const variance = value === null ? null : value - row.systemQty
              return (
                <DetailTableRow key={row.id}>
                  <DetailTableTd className="font-mono text-xs">{row.sku}</DetailTableTd>
                  <DetailTableTd className="font-medium">{row.name}</DetailTableTd>
                  <DetailTableTd>{row.uom}</DetailTableTd>
                  <DetailTableTd align="right">{formatAccounting(row.systemQty, { zeroDash: false })}</DetailTableTd>
                  <DetailTableTd align="right">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={raw ?? ""}
                      onChange={(e) => setCounted((prev) => ({ ...prev, [row.id]: e.target.value }))}
                      className="w-[110px] text-right"
                      aria-label={`Hasil hitung ${row.name}`}
                    />
                  </DetailTableTd>
                  <DetailTableTd align="right" className={variance === null || variance === 0 ? "" : variance > 0 ? "text-success font-semibold" : "text-danger font-semibold"}>
                    {variance === null ? "–" : formatAccounting(variance, { zeroDash: false })}
                  </DetailTableTd>
                </DetailTableRow>
              )
            })}
          </DetailTableBody>
        </DetailTable>
      </ReportSection>

      <FormCard>
        <FormSection title="Catatan" columns={1}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Catatan Opname</Label>
            <Textarea
              id="notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="mis. opname akhir bulan, dihitung oleh ..."
            />
          </div>
        </FormSection>
        <FormActions>
          <Button type="button" onPress={() => router.back()}>Batal</Button>
          <Button type="submit" variant="primary" isDisabled={isPending || differing.length === 0}>
            {isPending ? "Menyimpan..." : `Buat Penyesuaian (${differing.length} selisih)`}
          </Button>
        </FormActions>
      </FormCard>
    </form>
  )
}
