"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Send, CheckCircle, XCircle, FilePenLine } from "lucide-react"
import { Button } from "@/components/ui/button"
import { showSuccess, showError } from "@/lib/utils/toast"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { sendQuotation, acceptQuotation, rejectQuotation, reviseQuotation } from "@/actions/sales.actions"

/**
 * Alur penawaran: konsep -> terkirim -> diterima/ditolak.
 *
 * Sengaja BUKAN <StatusActions> generik: rute /api/workflow hanya membalik status
 * lewat updateMany dan tak menjalankan efek domain apa pun, sedangkan ketiga aksi
 * ini menulis quotationHistory (dirender sebagai timeline di halaman ini) dan
 * acceptQuotation juga mengirim notifikasi ke admin. Bar generik tetap ada untuk
 * approval internal; tombol di sini melengkapi alur pelanggannya.
 */
export function QuotationFlowActions({ status, id }: { status: string; id: number }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isReviseOpen, setIsReviseOpen] = useState(false)
  const [reason, setReason] = useState("")

  function run(
    action: () => Promise<{ success: boolean; error?: string } | void>,
    sukses: string,
    gagal: string,
  ) {
    startTransition(async () => {
      const result = await action()
      if (result && result.success === false) {
        showError(result.error || gagal)
        return
      }
      showSuccess(sukses)
      router.refresh()
    })
  }

  function handleRevise() {
    if (!reason.trim()) {
      showError("Alasan perubahan wajib diisi")
      return
    }
    startTransition(async () => {
      const result = await reviseQuotation(id, reason.trim())
      if (result && result.success === false) {
        showError(result.error || "Gagal merevisi penawaran")
        return
      }
      showSuccess("Penawaran direvisi")
      setReason("")
      setIsReviseOpen(false)
      router.refresh()
    })
  }

  if (status === "draft") {
    return (
      <Button
        variant="secondary"
        onPress={() => run(() => sendQuotation(id), "Penawaran ditandai terkirim", "Gagal menandai terkirim")}
        isDisabled={isPending}
      >
        <Send size={14} aria-hidden="true" /> Tandai Terkirim
      </Button>
    )
  }

  if (status === "sent") {
    return (
      <>
        <Button
          variant="secondary"
          onPress={() => run(() => acceptQuotation(id), "Penawaran diterima", "Gagal menerima penawaran")}
          isDisabled={isPending}
        >
          <CheckCircle size={14} aria-hidden="true" /> Terima
        </Button>
        <Button
          variant="secondary"
          onPress={() => setIsReviseOpen(true)}
          isDisabled={isPending}
        >
          <FilePenLine size={14} aria-hidden="true" /> Revisi
        </Button>
        <Button
          variant="danger"
          onPress={() => run(() => rejectQuotation(id), "Penawaran ditolak", "Gagal menolak penawaran")}
          isDisabled={isPending}
        >
          <XCircle size={14} aria-hidden="true" /> Tolak
        </Button>

        {/* reviseQuotation menuntut alasan dan hanya menerima status `sent`; baris
            "Revisi" di timeline detail berasal dari sini. */}
        <ConfirmDialog
          isOpen={isReviseOpen}
          onOpenChange={setIsReviseOpen}
          title="Revisi penawaran ini?"
          confirmLabel="Simpan Revisi"
          cancelLabel="Batal"
          variant="warning"
          isPending={isPending}
          onConfirm={handleRevise}
        >
          <span className="block mb-2">
            Nomor revisi bertambah dan isi penawaran saat ini disimpan sebagai riwayat.
          </span>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Alasan perubahan (wajib)"
            aria-label="Alasan perubahan"
          />
        </ConfirmDialog>
      </>
    )
  }

  return null
}
