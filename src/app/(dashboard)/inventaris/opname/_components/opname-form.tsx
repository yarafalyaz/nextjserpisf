"use client"

import { useRouter } from "next/navigation"
import { useId, useMemo, useRef, useState, useTransition } from "react"
import { createStockAdjustment } from "@/actions/inventory.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { Label } from "@/components/ui/shadcn/label"
import { Button } from "@/components/ui/button"
import { FormCard, FormSection, FormActions } from "@/components/ui/form-section"
import { formatAccounting, formatCurrency } from "@/lib/utils/format"
import {
  ArrowDown,
  ArrowUp,
  Boxes,
  RotateCcw,
  ScanBarcode,
  Search,
  TableList,
} from "@/components/ui/fontawesome-icons"
import { safeMultiply, safeSubtract } from "@/lib/utils/math"

interface OpnameRow {
  id: number
  sku: string
  name: string
  uom: string
  systemQty: number
  unitCost: number
  trackBatch?: boolean
  trackSerial?: boolean
}

function splitList(v: string): string[] {
  return v.split(/[\n,]/).map((s) => s.trim()).filter(Boolean)
}

interface OpnameFormProps {
  warehouseId: number
  date: string
  rows: OpnameRow[]
  /** Izin create_stock_adjustments dari server — gerbang input + tombol simpan. */
  canCreate: boolean
}

/**
 * Count sheet: every line is prefilled with the system quantity, so the operator
 * only edits the lines that differ. Only lines whose count differs from the
 * system quantity are submitted (the rest would be no-op adjustments).
 */
export function OpnameForm({ warehouseId, date, rows, canCreate }: OpnameFormProps) {
  const router = useRouter()
  const searchInputId = useId()
  // Idempotency: key stabil per intent; retry sesudah respons hilang memakai
  // key sama (ditolak server). Sukses bernavigasi pergi, tak perlu rotasi.
  const idempotencyKeyRef = useRef<string | null>(null)
  if (idempotencyKeyRef.current === null) idempotencyKeyRef.current = crypto.randomUUID()
  const [isPending, startTransition] = useTransition()
  const [counted, setCounted] = useState<Record<number, string>>(
    Object.fromEntries(rows.map((row) => [row.id, String(row.systemQty)])),
  )
  const [lots, setLots] = useState<Record<number, { batch: string; serial: string }>>({})
  const [notes, setNotes] = useState("")
  const [filterSearch, setFilterSearch] = useState("")
  const [filterStatus, setFilterStatus] = useState<"all" | "diff" | "match">("all")

  const diffSummary = useMemo(() => {
    let diffCount = 0
    let surplusCount = 0
    let deficitCount = 0
    let netVarianceValue = 0

    for (const row of rows) {
      const raw = counted[row.id]
      if (raw !== undefined && raw.trim() !== "") {
        const val = Number(raw)
        const variance = val - row.systemQty
        if (variance !== 0) {
          diffCount++
          if (variance > 0) surplusCount++
          else deficitCount++
          netVarianceValue += safeMultiply(variance, row.unitCost)
        }
      }
    }

    return { diffCount, surplusCount, deficitCount, netVarianceValue }
  }, [counted, rows])

  const differing = rows.filter((row) => {
    const value = counted[row.id]
    if (value === undefined || value.trim() === "") return false
    return Number(value) !== row.systemQty
  })

  const visibleRows = useMemo(() => {
    return rows.filter((row) => {
      if (filterSearch) {
        const q = filterSearch.toLowerCase()
        const matchSku = row.sku.toLowerCase().includes(q)
        const matchName = row.name.toLowerCase().includes(q)
        if (!matchSku && !matchName) return false
      }

      const raw = counted[row.id]
      const hasDiff = raw !== undefined && raw.trim() !== "" && Number(raw) !== row.systemQty

      if (filterStatus === "diff" && !hasDiff) return false
      if (filterStatus === "match" && hasDiff) return false

      return true
    })
  }, [rows, counted, filterSearch, filterStatus])

  function resetToSystemQty() {
    setCounted(Object.fromEntries(rows.map((row) => [row.id, String(row.systemQty)])))
  }

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
      batchNumbers: lots[row.id]?.batch ? splitList(lots[row.id].batch) : undefined,
      serialNumbers: lots[row.id]?.serial ? splitList(lots[row.id].serial) : undefined,
    }))

    const formData = new FormData()
    formData.set("warehouseId", String(warehouseId))
    formData.set("date", date)
    formData.set("reason", "Hasil stok opname")
    formData.set("notes", notes)
    formData.set("items", JSON.stringify(items))
    formData.set("idempotencyKey", idempotencyKeyRef.current!)

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
      {/* Strip KPI Metrik Terpadu Standar Enterprise ERP */}
      <div className="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-border rounded-lg border border-border bg-card shadow-2xs overflow-hidden">
        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Item Dihitung</span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight text-foreground tabular-nums">{rows.length}</span>
            <span className="text-xs text-muted-foreground">SKU terdaftar</span>
          </div>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Selisih (Variance)</span>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-bold font-mono tracking-tight tabular-nums ${diffSummary.diffCount > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
              {diffSummary.diffCount}
            </span>
            <span className="text-xs text-muted-foreground">SKU berbeda fisik</span>
          </div>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Surplus / Defisit</span>
          <div className="flex items-center gap-3 text-xs font-medium font-mono pt-1">
            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <ArrowUp className="size-3" />
              <span>+{diffSummary.surplusCount} Surplus</span>
            </span>
            <span className="text-border">|</span>
            <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
              <ArrowDown className="size-3" />
              <span>-{diffSummary.deficitCount} Defisit</span>
            </span>
          </div>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Estimasi Nilai Selisih</span>
          <div className="flex items-baseline gap-2">
            <span className={`text-lg font-bold font-mono tracking-tight tabular-nums ${diffSummary.netVarianceValue === 0 ? "text-foreground" : diffSummary.netVarianceValue > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
              {formatCurrency(diffSummary.netVarianceValue)}
            </span>
          </div>
        </div>
      </div>

      {/* Kontrol Filter & Tabel Hitung Fisik */}
      <div className="rounded-lg border border-border bg-card shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-border bg-muted/20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <TableList className="size-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm text-foreground">Daftar Barang & Lembar Hitung</h3>
            <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-muted text-muted-foreground border border-border">
              {visibleRows.length} dari {rows.length}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Input
                id={searchInputId}
                type="search"
                placeholder="Cari SKU atau nama barang..."
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                className="w-48 sm:w-64 h-8 text-xs pl-8"
              />
              <Search className="size-3.5 text-muted-foreground absolute left-2.5 top-2.5 pointer-events-none" />
            </div>

            <div className="flex items-center rounded-md border border-border bg-card p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setFilterStatus("all")}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${filterStatus === "all" ? "bg-muted text-foreground font-semibold shadow-2xs" : "text-muted-foreground hover:text-foreground"}`}
              >
                Semua
              </button>
              <button
                type="button"
                onClick={() => setFilterStatus("diff")}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${filterStatus === "diff" ? "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200 font-semibold" : "text-muted-foreground hover:text-foreground"}`}
              >
                Hanya Selisih ({diffSummary.diffCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterStatus("match")}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${filterStatus === "match" ? "bg-muted text-foreground font-semibold shadow-2xs" : "text-muted-foreground hover:text-foreground"}`}
              >
                Cocok
              </button>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onPress={resetToSystemQty}
              isDisabled={!canCreate || diffSummary.diffCount === 0}
              className="h-8 text-xs gap-1.5"
            >
              <RotateCcw className="size-3" />
              <span>Reset Hitungan</span>
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse" data-report-table="Lembar Penghitungan Stok">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-muted-foreground font-medium uppercase tracking-wider text-[11px]">
                <th className="py-2.5 px-4 w-[120px]">SKU</th>
                <th className="py-2.5 px-4 min-w-[200px]">Nama Barang</th>
                <th className="py-2.5 px-4 w-[80px]">Satuan</th>
                <th className="py-2.5 px-4 w-[130px] text-right">Stok Sistem</th>
                <th className="py-2.5 px-4 w-[150px] text-right">Hasil Fisik</th>
                <th className="py-2.5 px-4 w-[130px] text-right">Selisih</th>
                <th className="py-2.5 px-4 min-w-[180px]">Tracking Lot / Serial</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted-foreground">
                    Tidak ada barang yang cocok dengan kriteria pencarian.
                  </td>
                </tr>
              ) : (
                visibleRows.map((row) => {
                  const raw = counted[row.id]
                  const value = raw === undefined || raw.trim() === "" ? null : Number(raw)
                  const variance = value === null ? null : safeSubtract(value, row.systemQty)
                  const isDiffering = variance !== null && variance !== 0
                  return (
                    <tr
                      key={row.id}
                      className={`hover:bg-muted/30 transition-colors ${isDiffering ? "bg-amber-50/40 dark:bg-amber-950/20" : ""}`}
                    >
                      <td className="py-2.5 px-4 font-mono font-medium text-foreground">{row.sku}</td>
                      <td className="py-2.5 px-4 font-medium text-foreground">
                        <div>{row.name}</div>
                        {(row.trackBatch || row.trackSerial) && (
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {row.trackBatch && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800">
                                <Boxes className="size-2.5" /> Batch
                              </span>
                            )}
                            {row.trackSerial && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300 border border-purple-200/60 dark:border-purple-800">
                                <ScanBarcode className="size-2.5" /> Serial
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-muted-foreground">{row.uom}</td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-muted-foreground">
                        {formatAccounting(row.systemQty, { zeroDash: false })}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={raw ?? ""}
                          disabled={!canCreate}
                          onChange={(e) => setCounted((prev) => ({ ...prev, [row.id]: e.target.value }))}
                          className={`w-[120px] h-8 text-right font-mono tabular-nums ml-auto ${isDiffering ? "border-amber-500 font-semibold text-amber-900 dark:text-amber-200 bg-amber-50/50 dark:bg-amber-950/40" : ""}`}
                          aria-label={`Hasil hitung ${row.name}`}
                        />
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                        {variance === null ? (
                          <span className="text-muted-foreground">-</span>
                        ) : variance === 0 ? (
                          <span className="text-muted-foreground font-medium">0</span>
                        ) : variance > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            +{formatAccounting(variance, { zeroDash: false })}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300">
                            {formatAccounting(variance, { zeroDash: false })}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="flex flex-col gap-1.5">
                          {row.trackBatch && (
                            <Input
                              value={lots[row.id]?.batch ?? ""}
                              disabled={!canCreate}
                              onChange={(e) => setLots((prev) => ({ ...prev, [row.id]: { ...prev[row.id], batch: e.target.value, serial: prev[row.id]?.serial ?? "" } }))}
                              placeholder="Surplus Batch: LOT-A, LOT-B"
                              aria-label={`Nomor batch ${row.name}`}
                              className="w-[180px] h-7 text-xs font-mono"
                            />
                          )}
                          {row.trackSerial && (
                            <Input
                              value={lots[row.id]?.serial ?? ""}
                              disabled={!canCreate}
                              onChange={(e) => setLots((prev) => ({ ...prev, [row.id]: { ...prev[row.id], serial: e.target.value, batch: prev[row.id]?.batch ?? "" } }))}
                              placeholder="Surplus Serial: SN-1, SN-2"
                              aria-label={`Nomor serial ${row.name}`}
                              className="w-[180px] h-7 text-xs font-mono"
                            />
                          )}
                          {!row.trackBatch && !row.trackSerial && (
                            <span className="text-muted-foreground text-[11px] italic">-</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <FormCard>
        <FormSection title="Dokumentasi & Catatan Opname" columns={1}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Keterangan / Berita Acara Opname</Label>
            <Textarea
              id="notes"
              rows={2}
              value={notes}
              disabled={!canCreate}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contoh: Opname fisik berkala akhir periode, diverifikasi oleh tim audit gudang..."
            />
          </div>
        </FormSection>
        <FormActions>
          <Button type="button" onPress={() => router.back()}>Batal</Button>
          {canCreate && (
            <Button type="submit" variant="primary" isDisabled={isPending || differing.length === 0}>
              {isPending ? "Menyimpan..." : `Buat Penyesuaian (${differing.length} selisih)`}
            </Button>
          )}
        </FormActions>
      </FormCard>
    </form>
  )
}
