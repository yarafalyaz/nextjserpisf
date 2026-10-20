"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Send, CheckCircle, XCircle, FilePenLine } from "lucide-react"
import { Button } from "@/components/ui/button"
import { showSuccess, showError } from "@/lib/utils/toast"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { sendQuotation, acceptQuotation, rejectQuotation, reviseQuotation } from "@/actions/sales.actions"
import {
  LOST_REASON_CATEGORIES,
  formatLostReasonReason,
  isLostReasonCategoryKey,
  type LostReasonCategoryKey,
} from "@/lib/reports/quotation-outcome"

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
  const [isRejectOpen, setIsRejectOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [rejectReason, setRejectReason] = useState("")
  const [lostCategory, setLostCategory] = useState<LostReasonCategoryKey | "">("")

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

  function handleReject() {
    // F-2026-10-20-101: kategori kalah wajib dipilih agar penolakan bisa
    // diagregasi; teks bebas tetap opsional sebagai pendamping.
    if (!isLostReasonCategoryKey(lostCategory)) {
      showError("Kategori alasan penolakan wajib dipilih")
      return
    }
    startTransition(async () => {
      // Kategori dikirim sebagai awalan terstruktur pada `reason` existing;
      // server membungkusnya ke description histori tanpa ubah kontrak aksi.
      const reason = formatLostReasonReason({
        category: lostCategory,
        freeText: rejectReason.trim() || undefined,
      })
      const result = await rejectQuotation(id, reason)
      if (result && result.success === false) {
        showError(result.error || "Gagal menolak penawaran")
        return
      }
      showSuccess("Penawaran ditolak")
      setRejectReason("")
      setLostCategory("")
      setIsRejectOpen(false)
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
          onPress={() => setIsRejectOpen(true)}
          isDisabled={isPending}
        >
          <XCircle size={14} aria-hidden="true" /> Tolak
        </Button>

        {/* Kategori kalah wajib + teks bebas opsional (F-2026-10-20-101,
            lanjutan F-38a): kategori dikirim sebagai awalan terstruktur
            pada reason agar histori bisa diagregasi per periode. */}
        <ConfirmDialog
          isOpen={isRejectOpen}
          onOpenChange={setIsRejectOpen}
          title="Tolak penawaran ini?"
          confirmLabel="Tolak Penawaran"
          cancelLabel="Batal"
          variant="danger"
          isPending={isPending}
          onConfirm={handleReject}
        >
          <span className="block mb-2">
            Penawaran ditandai ditolak oleh pelanggan.
          </span>
          <label className="block mb-2 text-sm font-medium" htmlFor="lost-reason-category">
            Kategori alasan penolakan <span aria-hidden="true">*</span>
          </label>
          <select
            id="lost-reason-category"
            className="mb-3 block w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={lostCategory}
            onChange={(e) => setLostCategory(e.target.value as LostReasonCategoryKey | "")}
            aria-required="true"
          >
            <option value="">Pilih kategori alasan</option>
            {LOST_REASON_CATEGORIES.map((category) => (
              <option key={category.key} value={category.key}>
                {category.label}
              </option>
            ))}
          </select>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Alasan penolakan (opsional)"
            aria-label="Alasan penolakan"
          />
        </ConfirmDialog>

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
