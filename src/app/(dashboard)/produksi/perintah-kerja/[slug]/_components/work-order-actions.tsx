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
  defaultWarehouseId: number | null
  /** Item WO yang bisa ditandai diganti (belum replaced). */
  revisableItems?: { id: number; label: string }[]
}

/**
 * Work Order lifecycle controls. Surfaces the manufacturing flow that previously
 * existed only in server actions but had no UI: start → issue materials → complete.
 */
export function WorkOrderActions({ workOrderId, status, hasCompletedMaterialIssue, defaultWarehouseId, revisableItems = [] }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [reviseOpen, setReviseOpen] = useState(false)
  const [picked, setPicked] = useState<number[]>([])

  function run(fn: () => Promise<{ success: boolean; error?: string }>, okMsg: string) {
    startTransition(async () => {
      try {
        const res = await fn()
        if (res?.success) {
          showSuccess(okMsg)
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
    return (
      <Button variant="primary" isDisabled={isPending} onPress={() => run(() => startWorkOrder(workOrderId), "Perintah Kerja dimulai")}>
        Mulai Pengerjaan
      </Button>
    )
  }

  if (status === "in_progress") {
    return (
      <>
        {!hasCompletedMaterialIssue && (
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
        <Button
          variant="primary"
          isDisabled={isPending || !hasCompletedMaterialIssue}
          onPress={() => run(() => completeWorkOrder(workOrderId), "Perintah Kerja selesai")}
        >
          Selesaikan
        </Button>
      </>
    )
  }

  return null
}
