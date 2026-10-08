"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle, XCircle, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { showSuccess, showError } from "@/lib/utils/toast"
import { statusLabel } from "@/lib/utils/status-labels"
import { approveExpense, rejectExpense } from "@/actions/finance.actions"

/**
 * Expense approval actions.
 *
 * Deliberately NOT the generic <StatusActions>: that component POSTs to
 * /api/workflow/... which flips the document status via a plain updateMany and
 * runs NO domain side effects. Approving an expense must ALSO sync the petty
 * cash ledger (see approveExpense → onExpenseApprovedSyncPettyCash), and the
 * workflow engine never does that. Routing expense approval through the generic
 * status route would silently approve the expense without recording the petty
 * cash OUT — understating petty cash with no retry path. So this component calls
 * the domain actions directly.
 */
export function ExpenseApprovalActions({ status, id }: { status: string; id: number }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const canApprove = status === "draft" || status === "pending"
  const canReject = status === "draft" || status === "pending"

  function handleAction(action: "approve" | "reject") {
    startTransition(async () => {
      const result = action === "approve" ? await approveExpense(id) : await rejectExpense(id)
      if (result && result.success === false) {
        showError(result.error || "Gagal memproses pengeluaran")
        return
      }
      showSuccess(action === "approve" ? "Pengeluaran disetujui" : "Pengeluaran ditolak")
      router.refresh()
    })
  }

  const colorClass =
    status === "approved"
      ? "bg-success/20 text-success-600"
      : status === "rejected"
        ? "bg-danger/20 text-danger-600"
        : "bg-warning/20 text-warning-600"

  return (
    <div className="flex items-center justify-between p-4 bg-surface rounded-xl border border-default shadow-sm">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-muted-foreground">Status:</span>
        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold capitalize ${colorClass}`}
        >
          {status === "approved" ? (
            <CheckCircle size={12} aria-hidden="true" />
          ) : status === "rejected" ? (
            <XCircle size={12} aria-hidden="true" />
          ) : (
            <Clock size={12} aria-hidden="true" />
          )}
          {statusLabel(status)}
        </span>
      </div>
      {(canApprove || canReject) && (
        <div className="flex gap-2">
          {canApprove && (
            <Button
              variant="success"
              size="sm"
              onPress={() => handleAction("approve")}
              isDisabled={isPending}
            >
              <CheckCircle size={14} aria-hidden="true" />
              Setujui
            </Button>
          )}
          {canReject && (
            <Button
              variant="danger"
              size="sm"
              onPress={() => handleAction("reject")}
              isDisabled={isPending}
            >
              <XCircle size={14} aria-hidden="true" />
              Tolak
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
