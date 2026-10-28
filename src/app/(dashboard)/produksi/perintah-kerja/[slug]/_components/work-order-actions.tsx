"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { startWorkOrder, completeWorkOrder, createMaterialIssueFromWorkOrder } from "@/actions/manufacturing.actions"
import { reviseWorkOrderItems } from "@/actions/inventory.actions"
import { Button } from "@/components/ui/button"
import { showSuccess, showError } from "@/lib/utils/toast"

interface Props {
  workOrderId: number
  status: string
  hasCompletedMaterialIssue: boolean
  /** Pengeluaran material aktif (draf/diproses) sudah ada untuk WO ini:
   *  pembuatan baru pasti ditolak server, jadi tombol disembunyikan (WO-BR-004). */
  hasActiveMaterialIssue?: boolean
  defaultWarehouseId: number | null
  /** Item WO yang bisa ditandai diganti (belum replaced). */
  revisableItems?: { id: number; label: string }[]
  /** F-50(b): WO kendaraan belum punya inspeksi vehicle_intake tercatat (gate F-50a). */
  vehicleIntakeBlocked?: boolean
  /** Tautan catat inspeksi masuk (prefill WO ini) saat vehicleIntakeBlocked. */
  vehicleIntakeHref?: string
  /** F-020-B Q3: jumlah tahap pending dari builder; peringatan saja, tidak memblokir complete. */
  pendingStageCount?: number
}

/**
 * Work Order lifecycle controls. Surfaces the manufacturing flow that previously
 * existed only in server actions but had no UI: start → issue materials → complete.
 */
export function WorkOrderActions({ workOrderId, status, hasCompletedMaterialIssue, hasActiveMaterialIssue = false, defaultWarehouseId, revisableItems = [], vehicleIntakeBlocked = false, vehicleIntakeHref, pendingStageCount }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [reviseOpen, setReviseOpen] = useState(false)
  const [picked, setPicked] = useState<number[]>([])

  function run(
    fn: () => Promise<{ success: boolean; error?: string; releaseNotice?: string | null }>,
    okMsg: string,
  ) {
    startTransition(async () => {
      try {
        const res = await fn()
        if (res?.success) {
          // F-057-S §1: kata rilis verbatim dari aksi (releaseNotice) menggantikan
          // pesan generik bila ada baris reservasi terlepas; null = tanpa notice.
          showSuccess(res.releaseNotice ?? okMsg)
          router.refresh()
        } else {
          showError(res?.error || "Gagal memproses")
        }
      } catch (e) {
        showError(e instanceof Error ? e.message : "Gagal memproses")
      }
    })
  }

  if (status === "draft" || status === "pending") {
    if (vehicleIntakeBlocked) {
      return (
        <span className="flex flex-wrap items-center gap-2">
          <Button variant="primary" isDisabled aria-describedby="wo-intake-hint">
            Mulai Pengerjaan
          </Button>
          {vehicleIntakeHref && (
            <Button href={vehicleIntakeHref} variant="secondary">
              Buat Inspeksi Masuk
            </Button>
          )}
          <span id="wo-intake-hint" role="note" className="text-xs text-muted-foreground">
            inspeksi masuk kendaraan belum tercatat — catat inspeksi masuk (vehicle intake) untuk WO ini sebelum memulai.
          </span>
        </span>
      )
    }
    return (
      <Button variant="primary" isDisabled={isPending} onPress={() => run(() => startWorkOrder(workOrderId), "Perintah Kerja dimulai")}>
        Mulai Pengerjaan
      </Button>
    )
  }

  if (status === "in_progress") {
    return (
      <>
        {/* WO-BR-004: server menolak pembuatan MI kedua untuk WO yang sama
            (createMaterialIssueFromWorkOrder); sembunyikan tombol bila MI
            aktif sudah ada supaya pengguna tidak diarahkan ke kegagalan. */}
        {!hasCompletedMaterialIssue && !hasActiveMaterialIssue && (
          <Button
            variant="secondary"
            isDisabled={isPending || !defaultWarehouseId}
            onPress={() => run(() => createMaterialIssueFromWorkOrder(workOrderId, defaultWarehouseId as number), "Pengeluaran material dibuat (draf) — selesaikan di menu Inventaris")}
          >
            Buat Pengeluaran Material
          </Button>
        )}
        {revisableItems.length > 0 && !reviseOpen && (
          <Button variant="secondary" isDisabled={isPending} onPress={() => setReviseOpen(true)}>
            Ganti Item
          </Button>
        )}
        {reviseOpen && (
          <span className="flex flex-wrap items-center gap-2">
            {revisableItems.map((it) => (
              <label key={it.id} className="flex items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  aria-label={`Tandai diganti: ${it.label}`}
                  checked={picked.includes(it.id)}
                  onChange={(e) =>
                    setPicked((p) => (e.target.checked ? [...p, it.id] : p.filter((x) => x !== it.id)))
                  }
                />
                {it.label}
              </label>
            ))}
            <Button
              variant="primary"
              isDisabled={isPending || picked.length === 0}
              onPress={() =>
                run(async () => {
                  const res = await reviseWorkOrderItems({ workOrderId, replacedItemIds: picked })
                  if (res.success) { setReviseOpen(false); setPicked([]) }
                  return res
                }, "Item ditandai diganti")
              }
            >
              Simpan Penggantian
            </Button>
            <Button variant="secondary" isDisabled={isPending} onPress={() => { setReviseOpen(false); setPicked([]) }}>
              Batal
            </Button>
          </span>
        )}
        {typeof pendingStageCount === "number" && pendingStageCount > 0 ? (
          <p role="note" id="wo-stage-pending-note" className="text-sm text-amber-700">
            {pendingStageCount} tahap belum selesai — perintah kerja tetap
            dapat diselesaikan.
          </p>
        ) : null}
        <Button
          variant="primary"
          isDisabled={isPending || !hasCompletedMaterialIssue}
          aria-describedby={
            typeof pendingStageCount === "number" && pendingStageCount > 0
              ? "wo-stage-pending-note"
              : undefined
          }
          onPress={() => run(() => completeWorkOrder(workOrderId), "Perintah Kerja selesai")}
        >
          Selesaikan
        </Button>
      </>
    )
  }

  return null
}
