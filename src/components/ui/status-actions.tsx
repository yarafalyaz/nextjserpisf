"use client"

import { Button } from "@/components/ui/button"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { showSuccess, showError } from "@/lib/utils/toast"
import { statusLabel } from "@/lib/utils/status-labels"
import { CheckCircle, XCircle, Clock } from "lucide-react"

interface StatusActionsProps {
  status: string
  id: number
  module: string
  /**
   * Apakah pengguna boleh menyetujui/menolak (izin approve_* modul ini,
   * dihitung server di halaman pemanggil). Tanpa ini tombol tampil hanya
   * berdasar status — pengaju pun melihat Setujui atas pengajuannya sendiri
   * dan hanya menerima FORBIDDEN dari API.
   */
  canAct?: boolean
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

export function StatusActions({ status, id, module, canAct = true }: StatusActionsProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Selaras STATUS_ALLOWED_FROM di /api/workflow: pending/draft/sent boleh
  // disetujui/ditolak; status lain API menolak CONFLICT.
  const canApprove = canAct && ["draft", "pending", "sent"].includes(status)
  const canReject = canAct && ["draft", "pending", "sent"].includes(status)

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
    <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-surface rounded-xl border border-default shadow-sm">
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-sm font-medium text-muted-foreground shrink-0">Status:</span>
        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold capitalize ${colorClass}`}>
          {status === "draft" && <Clock size={12} aria-hidden="true" />}
          {status === "pending" && <Clock size={12} aria-hidden="true" />}
          {status === "approved" && <CheckCircle size={12} aria-hidden="true" />}
          {status === "rejected" && <XCircle size={12} aria-hidden="true" />}
          {statusLabel(status)}
        </span>
      </div>
      {(canApprove || canReject) && (
        <div className="flex flex-wrap gap-2">
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
