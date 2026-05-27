"use client"

import { Button } from "@/components/ui/page-header"


import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { showSuccess, showError } from "@/lib/utils/toast"
import { CheckCircle, XCircle, Clock } from "lucide-react"

interface StatusActionsProps {
  status: string
  id: number
  module: string
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-default/20 text-default-600",
  pending: "bg-warning/20 text-warning-600",
  approved: "bg-success/20 text-success-600",
  rejected: "bg-danger/20 text-danger-600",
  sent: "bg-primary/20 text-primary-600",
  paid: "bg-success/20 text-success-600",
  completed: "bg-success/20 text-success-600",
  cancelled: "bg-danger/20 text-danger-600",
  posted: "bg-primary/20 text-primary-600",
  partial: "bg-warning/20 text-warning-600",
}

export function StatusActions({ status, id, module }: StatusActionsProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const canApprove = ["draft", "pending"].includes(status)
  const canReject = ["draft", "pending"].includes(status)

  async function handleAction(action: "approve" | "reject") {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/workflow/${module}/${id}/${action}`, {
          method: "POST",
        })
        if (!res.ok) throw new Error("Gagal memproses")
        showSuccess(action === "approve" ? "Berhasil disetujui" : "Berhasil ditolak")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal memproses")
      }
    })
  }

  const colorClass = STATUS_COLORS[status] || "bg-default/20 text-default-600"

  return (
    <div className="flex items-center justify-between p-4 bg-surface rounded-xl border border-default shadow-sm">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-muted">Status:</span>
        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold capitalize ${colorClass}`}>
          {status === "draft" && <Clock size={12} />}
          {status === "pending" && <Clock size={12} />}
          {status === "approved" && <CheckCircle size={12} />}
          {status === "rejected" && <XCircle size={12} />}
          {status}
        </span>
      </div>
      {(canApprove || canReject) && (
        <div className="flex gap-2">
          {canApprove && (
            <Button
              onClick={() => handleAction("approve")}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-success text-white hover:bg-success/90 transition-all disabled:opacity-50"
            >
              <CheckCircle size={14} />
              Setujui
            </Button>
          )}
          {canReject && (
            <Button
              onClick={() => handleAction("reject")}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-danger text-white hover:bg-danger/90 transition-all disabled:opacity-50"
            >
              <XCircle size={14} />
              Tolak
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
