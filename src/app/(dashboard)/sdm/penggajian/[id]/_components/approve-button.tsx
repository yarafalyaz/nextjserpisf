"use client"

import { useTransition } from "react"
import { Button } from "@/components/ui/page-header"
import { CheckCircle, Loader2 } from "lucide-react"
import { approvePayroll } from "@/actions/hrm.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { useRouter } from "next/navigation"

export function ApprovePayrollButton({ payrollId }: { payrollId: number }) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const handleApprove = () => {
    if (!confirm("Apakah Anda yakin ingin memfinalisasi (approve) penggajian ini? Data yang sudah di-approve tidak bisa diubah lagi.")) return

    startTransition(async () => {
      try {
        await approvePayroll(payrollId)
        showSuccess("Penggajian berhasil disetujui (Finalisasi)!")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyetujui penggajian")
      }
    })
  }

  return (
    <Button onPress={handleApprove} isDisabled={isPending} className="bg-success text-white hover:bg-success-600 transition-colors">
      {isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
      {isPending ? "Memproses..." : "Finalisasi (Approve)"}
    </Button>
  )
}
