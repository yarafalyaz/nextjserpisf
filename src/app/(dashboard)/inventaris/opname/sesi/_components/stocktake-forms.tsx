"use client"

import { useRouter } from "next/navigation"
import { useRef, useState, useTransition } from "react"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { AppDatePicker } from "@/components/ui/date-picker"
import { Combobox } from "@/components/ui/combobox"
import {
  createStocktakeSession,
  snapshotStocktakeSession,
  saveStocktakeCounts,
  approveStocktakeSession,
  postStocktakeSession,
} from "@/actions/inventory.actions"

interface StocktakeWarehouseOption {
  id: number
  code: string
  name: string
}

/** Form sesi baru (gudang + tanggal + catatan). */
export function StocktakeSessionForm({
  canCreate,
  warehouses = [],
}: {
  canCreate: boolean
  warehouses?: StocktakeWarehouseOption[]
}) {
  const router = useRouter()
  // Idempotency: key stabil per intent; retry jaringan memakai key sama
  // (ditolak server). Dirotasi sesudah sukses karena form di-reset in-place
  // dan sesi berikutnya adalah intent baru yang sah.
  const idempotencyKeyRef = useRef<string | null>(null)
  if (idempotencyKeyRef.current === null) idempotencyKeyRef.current = crypto.randomUUID()
  const [isPending, startTransition] = useTransition()
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>(
    warehouses[0] ? String(warehouses[0].id) : ""
  )

  function onSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    startTransition(async () => {
      const data = new FormData(form)
      data.set("idempotencyKey", idempotencyKeyRef.current!)
      const res = await createStocktakeSession(data)
      if (!res.success) {
        showError(res.error || "Gagal membuat sesi")
        return
      }
      idempotencyKeyRef.current = crypto.randomUUID()
      showSuccess("Sesi dibuat")
      form.reset()
      router.refresh()
    })
  }

  if (!canCreate) return null

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-4 p-4 px-5 border-b border-border bg-card/50 sm:flex-row sm:items-end"
      aria-label="Buat sesi opname"
    >
      <div className="flex flex-1 flex-col gap-1.5 min-w-[220px]">
        <Label htmlFor="stkWarehouse" className="text-xs font-medium text-foreground">
          Gudang Target *
        </Label>
        {warehouses.length > 0 ? (
          <Combobox
            id="stkWarehouse"
            name="warehouseId"
            options={warehouses.map((w) => ({
              value: String(w.id),
              label: `${w.code} - ${w.name}`,
            }))}
            value={selectedWarehouseId}
            onChange={(val) => setSelectedWarehouseId(val ?? "")}
            placeholder="Pilih atau cari gudang..."
            className="w-full text-xs"
            required
          />
        ) : (
          <Input
            id="stkWarehouse"
            name="warehouseId"
            type="number"
            min={1}
            placeholder="Masukkan ID Gudang"
            required
            className="h-9 text-xs"
          />
        )}
      </div>

      <div className="w-full sm:w-48">
        <AppDatePicker label="Tanggal Pencacahan *" name="date" required className="w-full" />
      </div>

      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor="stkNotes" className="text-xs font-medium text-foreground">
          Catatan / Referensi Sesi
        </Label>
        <Input
          id="stkNotes"
          name="notes"
          placeholder="Misal: Opname Bulanan Q4 / Siklus Khusus"
          className="h-9 text-xs"
        />
      </div>

      <Button type="submit" isDisabled={isPending} className="h-9 text-xs px-4">
        {isPending ? "Menyimpan..." : "Buat Sesi"}
      </Button>
    </form>
  )
}

/** Tombol alur per sesi: snapshot / setujui / posting. */
export function StocktakeActions({ id, status, canCreate, canEdit }: { id: number; status: string; canCreate: boolean; canEdit: boolean }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function run(label: string, fn: () => Promise<{ success: boolean; error?: string }>) {
    startTransition(async () => {
      const res = await fn()
      if (!res.success) {
        showError(res.error || `Gagal: ${label}`)
        return
      }
      showSuccess(label)
      router.refresh()
    })
  }

  return (
    <>
      {status === "draft" && canCreate && (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          isDisabled={isPending}
          onPress={() => run("Snapshot dibuat", () => snapshotStocktakeSession(id))}
        >
          Snapshot
        </Button>
      )}
      {status === "review" && canEdit && (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          isDisabled={isPending}
          onPress={() => run("Sesi disetujui", () => approveStocktakeSession(id))}
        >
          Setujui
        </Button>
      )}
      {status === "approved" && canCreate && (
        <Button
          type="button"
          size="sm"
          isDisabled={isPending}
          onPress={() => run("Sesi diposting", () => postStocktakeSession(id))}
        >
          Posting
        </Button>
      )}
    </>
  )
}

export interface CountRow {
  id: number
  sku: string
  name: string
  systemQty: number
  count1: number | null
  count2: number | null
  trackBatch?: boolean
  trackSerial?: boolean
  batchNumbers?: string[]
  serialNumbers?: string[]
}

/** "LOT-A, LOT-B" -> daftar bersih (pola input lot penyesuaian STOK-12). */
function splitList(v: string): string[] {
  return v.split(/[\n,]/).map((s) => s.trim()).filter(Boolean)
}

/** Tabel hitung 1/2 per baris. */
export function StocktakeLineForm({ sessionId, lines, canCreate }: { sessionId: number; lines: CountRow[]; canCreate: boolean }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [counts, setCounts] = useState<Record<number, { count1: string; count2: string }>>({})
  const [lots, setLots] = useState<Record<number, { batch: string; serial: string }>>({})

  function set(lineId: number, field: "count1" | "count2", value: string) {
    setCounts((prev) => ({ ...prev, [lineId]: { ...prev[lineId], [field]: value } }))
  }

  function setLot(lineId: number, field: "batch" | "serial", value: string) {
    setLots((prev) => ({ ...prev, [lineId]: { ...prev[lineId], [field]: value } }))
  }

  function onSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const payload = lines.map((l) => ({
      lineId: l.id,
      count1: counts[l.id]?.count1 !== undefined && counts[l.id].count1 !== ""
        ? Number(counts[l.id].count1)
        : l.count1,
      count2: counts[l.id]?.count2 !== undefined && counts[l.id].count2 !== ""
        ? Number(counts[l.id].count2)
        : l.count2,
      batchNumbers: lots[l.id]?.batch !== undefined ? splitList(lots[l.id].batch) : l.batchNumbers,
      serialNumbers: lots[l.id]?.serial !== undefined ? splitList(lots[l.id].serial) : l.serialNumbers,
    }))
    startTransition(async () => {
      const fd = new FormData()
      fd.set("counts", JSON.stringify(payload))
      const res = await saveStocktakeCounts(sessionId, fd)
      if (!res.success) {
        showError(res.error || "Gagal menyimpan hitungan")
        return
      }
      showSuccess("Hitungan disimpan")
      setCounts({})
      router.refresh()
    })
  }

  if (lines.length === 0) {
    return <EmptyState title="Belum ada snapshot — tekan Snapshot." className="py-8" />
  }

  return (
    <form onSubmit={onSubmit} aria-label="Simpan hitungan opname" className="space-y-4">
      <div className="rounded-lg border border-border bg-card shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-muted-foreground font-medium uppercase tracking-wider text-[11px]">
                <th className="py-2.5 px-4">Item & SKU</th>
                <th className="py-2.5 px-4 text-right w-28">Kuantitas Sistem</th>
                <th className="py-2.5 px-4 text-center w-36">Hitung 1</th>
                <th className="py-2.5 px-4 text-center w-36">Hitung 2 (Recount)</th>
                <th className="py-2.5 px-4 w-64">Lot / Serial (Surplus)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lines.map((l) => (
                <tr key={l.id} className="hover:bg-muted/30 transition-colors">
                  <td className="py-2.5 px-4">
                    <div className="font-medium text-foreground">{l.name}</div>
                    <div className="font-mono text-[11px] text-muted-foreground mt-0.5">{l.sku}</div>
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono font-medium tabular-nums text-foreground">
                    {l.systemQty}
                  </td>
                  <td className="py-2.5 px-4">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      aria-label={`Hitung 1 baris ${l.id}`}
                      defaultValue={l.count1 ?? ""}
                      disabled={!canCreate}
                      onChange={(e) => set(l.id, "count1", e.target.value)}
                      className="flex h-8 w-full rounded-md border border-input bg-card px-2.5 py-1 text-xs text-right font-mono tabular-nums text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </td>
                  <td className="py-2.5 px-4">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      aria-label={`Hitung 2 baris ${l.id}`}
                      defaultValue={l.count2 ?? ""}
                      disabled={!canCreate}
                      onChange={(e) => set(l.id, "count2", e.target.value)}
                      className="flex h-8 w-full rounded-md border border-input bg-card px-2.5 py-1 text-xs text-right font-mono tabular-nums text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </td>
                  <td className="py-2.5 px-4">
                    <div className="flex flex-col gap-1.5">
                      {l.trackBatch && (
                        <input
                          type="text"
                          aria-label={`Nomor batch baris ${l.id}`}
                          defaultValue={(l.batchNumbers ?? []).join(", ")}
                          placeholder="Batch: LOT-A, LOT-B"
                          disabled={!canCreate}
                          onChange={(e) => setLot(l.id, "batch", e.target.value)}
                          className="flex h-7 w-full rounded-md border border-input bg-card px-2 py-0.5 text-[11px] font-mono text-foreground placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                        />
                      )}
                      {l.trackSerial && (
                        <input
                          type="text"
                          aria-label={`Nomor serial baris ${l.id}`}
                          defaultValue={(l.serialNumbers ?? []).join(", ")}
                          placeholder="Serial: SN-1, SN-2"
                          disabled={!canCreate}
                          onChange={(e) => setLot(l.id, "serial", e.target.value)}
                          className="flex h-7 w-full rounded-md border border-input bg-card px-2 py-0.5 text-[11px] font-mono text-foreground placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {canCreate && (
        <div className="flex justify-end gap-3">
          <Button type="submit" isDisabled={isPending} className="h-9 text-xs px-4">
            {isPending ? "Menyimpan..." : "Simpan Hitungan"}
          </Button>
        </div>
      )}
    </form>
  )
}
