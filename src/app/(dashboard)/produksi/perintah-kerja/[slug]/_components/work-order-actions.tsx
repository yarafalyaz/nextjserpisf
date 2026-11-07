"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { startWorkOrder, completeWorkOrder, createMaterialIssueFromWorkOrder, cancelWorkOrder } from "@/actions/manufacturing.actions"
import { VoidButton } from "@/components/ui/void-button"
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
  /**
   * Izin tulis per aksi, dihitung server di halaman pemanggil. Halaman detail
   * hanya menuntut view_work_orders, sedangkan tiap aksi menuntut izinnya
   * sendiri; tanpa prop ini peran lihat-saja melihat seluruh bar aksi dan
   * setiap klik berakhir FORBIDDEN dari action.
   */
  canEdit?: boolean
  canIssueMaterial?: boolean
  canComplete?: boolean
  /** manage_qc_inspections — untuk tombol "Buat Inspeksi Masuk". */
  canCreateInspection?: boolean
  /** complete_work_orders — izin yang dituntut cancelWorkOrder (batal beralasan). */
  canCancel?: boolean
}

/**
 * Work Order lifecycle controls. Surfaces the manufacturing flow that previously
 * existed only in server actions but had no UI: start → issue materials → complete.
 */
export function WorkOrderActions({ workOrderId, status, hasCompletedMaterialIssue, hasActiveMaterialIssue = false, defaultWarehouseId, revisableItems = [], vehicleIntakeBlocked = false, vehicleIntakeHref, pendingStageCount, canEdit = true, canIssueMaterial = true, canComplete = true, canCreateInspection = true, canCancel = true }: Props) {
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
      if (!canEdit && !canCreateInspection) return null
      return (
        <span className="flex flex-wrap items-center gap-2">
          <Button variant="primary" isDisabled aria-describedby="wo-intake-hint">
            Mulai Pengerjaan
          </Button>
          {canCreateInspection && vehicleIntakeHref && (
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
    if (!canEdit) return null
    return (
      <Button variant="primary" isDisabled={isPending} onPress={() => run(() => startWorkOrder(workOrderId), "Perintah Kerja dimulai")}>
        Mulai Pengerjaan
      </Button>
    )
  }

  if (status === "in_progress") {
    const canRevise = canEdit && revisableItems.length > 0
    if (!canEdit && !canIssueMaterial && !canComplete && !canCancel) return null
    return (
      <>
        {/* WO-BR-004: server menolak pembuatan MI kedua untuk WO yang sama
            (createMaterialIssueFromWorkOrder); sembunyikan tombol bila MI
            aktif sudah ada supaya pengguna tidak diarahkan ke kegagalan. */}
        {canIssueMaterial && !hasCompletedMaterialIssue && !hasActiveMaterialIssue && (
          <Button
            variant="secondary"
            isDisabled={isPending || !defaultWarehouseId}
            onPress={() => run(() => createMaterialIssueFromWorkOrder(workOrderId, defaultWarehouseId as number), "Pengeluaran material dibuat (draf) — selesaikan di menu Inventaris")}
          >
            Buat Pengeluaran Material
          </Button>
        )}
        {canRevise && !reviseOpen && (
          <Button variant="secondary" isDisabled={isPending} onPress={() => setReviseOpen(true)}>
            Ganti Item
          </Button>
        )}
        {canRevise && reviseOpen && (
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
        {canComplete && (
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
        )}
        {/* cancelWorkOrder adalah SATU-SATUNYA jalur in_progress -> cancelled
            (menolak status lain) dan menuntut alasan non-kosong. Tanpa tombol
            ini perintah kerja yang salah input tidak punya jalan keluar dari
            UI: Selesaikan memaksa job selesai, sedangkan closeWorkOrder hanya
            menerima status completed. VoidButton mengumpulkan alasannya. */}
        {canCancel && (
          <VoidButton
            id={workOrderId}
            action={cancelWorkOrder}
            canVoid={canCancel}
            requireReason
            label="Batalkan"
            title="Batalkan perintah kerja ini?"
            body="Perintah kerja ditandai dibatalkan dan reservasi stoknya dilepas. Baris tetap tersimpan untuk jejak audit. Hanya bisa dilakukan bila tidak ada pengeluaran material aktif atau order produksi anak yang berjalan."
          />
        )}
      </>
    )
  }

  return null
}
