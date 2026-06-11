"use client"

import { useState, useTransition } from "react"
import { Banknote } from "lucide-react"
import { markPayrollPaid } from "@/actions/hrm.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { useRouter } from "next/navigation"
import { Button as PageHeaderButton } from "@/components/ui/page-header"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"

export function MarkPaidPayrollButton({ payrollId }: { payrollId: number }) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)

  const handleMarkPaid = () => {
    startTransition(async () => {
      try {
        await markPayrollPaid(payrollId)
        showSuccess("Penggajian berhasil ditandai sebagai dibayar!")
        setIsOpen(false)
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menandai penggajian sebagai dibayar")
      }
    })
  }

  return (
    <>
      <PageHeaderButton onPress={() => setIsOpen(true)} className="bg-primary text-primary-foreground hover:bg-primary-600 transition-colors">
        <Banknote size={14} /> Tandai Dibayar
      </PageHeaderButton>

      <ConfirmDialog
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        title="Tandai Dibayar?"
        variant="accent"
        confirmLabel={isPending ? "Memproses..." : "Ya, Tandai Dibayar"}
        cancelLabel="Batal"
        isPending={isPending}
        onConfirm={handleMarkPaid}
        body={
          <span>
            Apakah Anda yakin ingin menandai slip gaji ini sebagai <strong>dibayar</strong>?
            <br /><br />
            <strong>Perhatian:</strong> Status ini tidak dapat dibatalkan.
          </span>
        }
      />
    </>
  )
}
