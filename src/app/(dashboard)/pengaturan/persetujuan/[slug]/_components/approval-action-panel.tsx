"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { approveStep, rejectStep, reopenApproval } from "@/actions/approval.actions"
import { Button } from "@/components/ui/button"
import { showError, showSuccess } from "@/lib/utils/toast"
import { CheckCircle2, RotateCcw, XCircle } from "@/components/ui/fontawesome-icons"

interface ApprovalActionPanelProps {
  approvalId: number
  status: string
}

export function ApprovalActionPanel({ approvalId, status }: ApprovalActionPanelProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [notes, setNotes] = useState("")
  const [notesError, setNotesError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function handleApprove() {
    setNotesError(null)
    const formData = new FormData()
    if (notes.trim()) formData.set("notes", notes.trim())

    startTransition(async () => {
      try {
        await approveStep(approvalId, formData)
        showSuccess("Langkah persetujuan berhasil disetujui")
        setNotes("")
        router.refresh()
      } catch (err) {
        showError(err instanceof Error ? err.message : "Gagal menyetujui persetujuan")
      }
    })
  }

  function handleReject() {
    const trimmed = notes.trim()
    if (!trimmed) {
      setNotesError("Alasan penolakan wajib diisi untuk jejak audit.")
      textareaRef.current?.focus()
      return
    }
    setNotesError(null)
    const formData = new FormData()
    formData.set("notes", trimmed)

    startTransition(async () => {
      try {
        await rejectStep(approvalId, formData)
        showSuccess("Pengajuan persetujuan telah ditolak")
        setNotes("")
        router.refresh()
      } catch (err) {
        showError(err instanceof Error ? err.message : "Gagal menolak persetujuan")
      }
    })
  }

  function handleReopen() {
    startTransition(async () => {
      try {
        const result = await reopenApproval(approvalId)
        if (!result.success) {
          showError(result.error || "Gagal membuka ulang persetujuan")
          return
        }
        showSuccess("Persetujuan dibuka ulang ke draf dokumen")
        router.refresh()
      } catch (err) {
        showError(err instanceof Error ? err.message : "Gagal membuka ulang persetujuan")
      }
    })
  }

  if (status === "pending") {
    return (
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden p-5 sm:p-6">
        <h2 className="text-[0.9375rem] font-semibold text-foreground mb-4">
          Keputusan Persetujuan
        </h2>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="approval-notes"
              className="text-sm font-medium text-foreground"
            >
              Catatan / Alasan Penolakan
              <span className="text-xs font-normal text-muted-foreground ml-1.5">
                (opsional saat Setujui, wajib saat Tolak)
              </span>
            </label>
            <textarea
              ref={textareaRef}
              id="approval-notes"
              name="notes"
              rows={3}
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value)
                if (notesError && e.target.value.trim()) setNotesError(null)
              }}
              placeholder="Tambahkan catatan pemeriksaan atau alasan penolakan..."
              aria-invalid={notesError ? true : undefined}
              className="w-full px-3 py-2.5 rounded-lg border border-default bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none"
            />
            {notesError && (
              <p className="text-xs font-medium text-danger" role="alert">
                {notesError}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="success"
              isDisabled={isPending}
              onPress={handleApprove}
              className="min-h-11 sm:min-h-9"
            >
              <CheckCircle2 className="size-4 mr-1.5" aria-hidden="true" />
              {isPending ? "Memproses..." : "Setujui"}
            </Button>
            <Button
              type="button"
              variant="danger"
              isDisabled={isPending}
              onPress={handleReject}
              className="min-h-11 sm:min-h-9"
            >
              <XCircle className="size-4 mr-1.5" aria-hidden="true" />
              {isPending ? "Memproses..." : "Tolak"}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (status === "rejected") {
    return (
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden p-5 sm:p-6">
        <h2 className="text-[0.9375rem] font-semibold text-foreground mb-3">
          Tindakan
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Persetujuan ini ditolak. Buka ulang untuk mengembalikan dokumen sumber ke status draf dan mengajukan persetujuan baru.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="primary"
            isDisabled={isPending}
            onPress={handleReopen}
            className="min-h-11 sm:min-h-9"
          >
            <RotateCcw className="size-4 mr-1.5" aria-hidden="true" />
            {isPending ? "Membuka..." : "Buka Ulang"}
          </Button>
        </div>
      </div>
    )
  }

  return null
}
