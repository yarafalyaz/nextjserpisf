"use client"

import { useState, useTransition } from "react"
import { CheckCircle } from "lucide-react"
import { approvePayroll } from "@/actions/hrm.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { useRouter } from "next/navigation"
import { Button as PageHeaderButton } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"

export function ApprovePayrollButton({ payrollId }: { payrollId: number }) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)

  const handleApprove = () => {
    startTransition(async () => {
      try {
        await approvePayroll(payrollId)
        showSuccess("Penggajian berhasil disetujui (Finalisasi)!")
        setIsOpen(false)
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyetujui penggajian")
      }
    })
  }

  return (
    <>
      <PageHeaderButton onPress={() => setIsOpen(true)} className="bg-success text-white hover:bg-success-600 transition-colors">
        <CheckCircle size={14} /> Finalisasi (Approve)
      </PageHeaderButton>

      <ConfirmDialog
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        title="Finalisasi Penggajian?"
        variant="warning"
        confirmLabel={isPending ? "Memproses..." : "Ya, Finalisasi Sekarang"}
        cancelLabel="Batal"
        isPending={isPending}
        onConfirm={handleApprove}
        body={
          <span>
            Apakah Anda yakin ingin menyetujui (approve) slip gaji ini?
            <br /><br />
            <strong>Perhatian:</strong> Data yang sudah disetujui tidak dapat diubah (edit) lagi dan siap untuk ditandai sebagai dibayar.
          </span>
        }
      />
    </>
  )
}
