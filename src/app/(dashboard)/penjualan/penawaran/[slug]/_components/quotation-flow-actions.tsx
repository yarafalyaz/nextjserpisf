"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { Send, CheckCircle, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { showSuccess, showError } from "@/lib/utils/toast"
import { sendQuotation, acceptQuotation, rejectQuotation } from "@/actions/sales.actions"

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
          variant="danger"
          onPress={() => run(() => rejectQuotation(id), "Penawaran ditolak", "Gagal menolak penawaran")}
          isDisabled={isPending}
        >
          <XCircle size={14} aria-hidden="true" /> Tolak
        </Button>
      </>
    )
  }

  return null
}
