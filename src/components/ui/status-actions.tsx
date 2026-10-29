"use client"

import { Button } from "@/components/ui/button"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { showSuccess, showError } from "@/lib/utils/toast"
import { StatusChip } from "@/components/ui/status-chip"
import { CheckCircle, XCircle } from "lucide-react"

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

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-surface rounded-xl border border-default shadow-sm">
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-sm font-medium text-muted-foreground shrink-0">Status:</span>
        {/* Token StatusChip (kontras AA terverifikasi), bukan warna legacy -600 di tint 20%. */}
        <StatusChip status={status} />
      </div>
      {(canApprove || canReject) && (
        <div className="flex flex-wrap gap-2">
          {canApprove && (
            <Button
              variant="success"
              size="sm"
              className="min-h-11"
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
              className="min-h-11"
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
