"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { AppDatePicker } from "@/components/ui/date-picker"
import {
  createStocktakeSession,
  snapshotStocktakeSession,
  saveStocktakeCounts,
  approveStocktakeSession,
  postStocktakeSession,
} from "@/actions/inventory.actions"

/** Form sesi baru (gudang + tanggal + catatan). */
export function StocktakeSessionForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    startTransition(async () => {
      const res = await createStocktakeSession(new FormData(form))
      if (!res.success) {
        showError(res.error || "Gagal membuat sesi")
        return
      }
      showSuccess("Sesi dibuat")
      form.reset()
      router.refresh()
    })
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-3 p-4 px-5 border-b border-default sm:flex-row sm:items-end"
      aria-label="Buat sesi opname"
    >
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor="stkWarehouse">ID Gudang *</Label>
        <Input id="stkWarehouse" name="warehouseId" type="number" min={1} required />
      </div>
      <AppDatePicker label="Tanggal *" name="date" required className="flex-1" />
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor="stkNotes">Catatan</Label>
        <Textarea id="stkNotes" name="notes" rows={1} />
      </div>
      <Button type="submit" isDisabled={isPending}>
        {isPending ? "Menyimpan..." : "Buat Sesi"}
      </Button>
    </form>
  )
}

/** Tombol alur per sesi: snapshot / setujui / posting. */
export function StocktakeActions({ id, status }: { id: number; status: string }) {
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
      {status === "draft" && (
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
      {status === "review" && (
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
      {status === "approved" && (
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
}

/** Tabel hitung 1/2 per baris. */
export function StocktakeLineForm({ sessionId, lines }: { sessionId: number; lines: CountRow[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [counts, setCounts] = useState<Record<number, { count1: string; count2: string }>>({})

  function set(lineId: number, field: "count1" | "count2", value: string) {
    setCounts((prev) => ({ ...prev, [lineId]: { ...prev[lineId], [field]: value } }))
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const payload = lines.map((l) => ({
      lineId: l.id,
      count1: counts[l.id]?.count1 !== undefined && counts[l.id].count1 !== ""
        ? Number(counts[l.id].count1)
        : l.count1,
      count2: counts[l.id]?.count2 !== undefined && counts[l.id].count2 !== ""
        ? Number(counts[l.id].count2)
        : l.count2,
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
    <form onSubmit={onSubmit} aria-label="Simpan hitungan opname">
      <table className="w-full border-collapse" style={{ fontSize: "0.8125rem" }}>
        <thead>
          <tr>
            <th>Item</th>
            <th>Sistem</th>
            <th>Hitung 1</th>
            <th>Hitung 2</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id}>
              <td>{l.sku} — {l.name}</td>
              <td>{l.systemQty}</td>
              <td>
                <input
                  type="number"
                  min={0}
                  step="any"
                  aria-label={`Hitung 1 baris ${l.id}`}
                  defaultValue={l.count1 ?? ""}
                  onChange={(e) => set(l.id, "count1", e.target.value)}
                  className="form-input"
                />
              </td>
              <td>
                <input
                  type="number"
                  min={0}
                  step="any"
                  aria-label={`Hitung 2 baris ${l.id}`}
                  defaultValue={l.count2 ?? ""}
                  onChange={(e) => set(l.id, "count2", e.target.value)}
                  className="form-input"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex justify-end gap-3 mt-4">
        <Button type="submit" isDisabled={isPending}>
          {isPending ? "Menyimpan..." : "Simpan Hitungan"}
        </Button>
      </div>
    </form>
  )
}
