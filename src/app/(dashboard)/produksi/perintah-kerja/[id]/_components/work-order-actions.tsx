"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { startWorkOrder, completeWorkOrder, createMaterialIssueFromWorkOrder } from "@/actions/manufacturing.actions"
import { Button } from "@/components/ui/page-header"
import { showSuccess, showError } from "@/lib/utils/toast"

interface Props {
  workOrderId: number
  status: string
  hasCompletedMaterialIssue: boolean
  defaultWarehouseId: number | null
}

/**
 * Work Order lifecycle controls. Surfaces the manufacturing flow that previously
 * existed only in server actions but had no UI: start → issue materials → complete.
 */
export function WorkOrderActions({ workOrderId, status, hasCompletedMaterialIssue, defaultWarehouseId }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

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
      <Button variant="primary" isDisabled={isPending} onPress={() => run(() => startWorkOrder(workOrderId), "Work Order dimulai")}>
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
            onPress={() => run(() => createMaterialIssueFromWorkOrder(workOrderId, defaultWarehouseId as number), "Pengeluaran material dibuat (draft) — selesaikan di menu Inventaris")}
          >
            Buat Pengeluaran Material
          </Button>
        )}
        <Button
          variant="primary"
          isDisabled={isPending || !hasCompletedMaterialIssue}
          onPress={() => run(() => completeWorkOrder(workOrderId), "Work Order selesai")}
        >
          Selesaikan
        </Button>
      </>
    )
  }

  return null
}
