"use client"

import { useState, useTransition } from "react"
import { FilePenLine } from "lucide-react"
import { correctPaidPayroll } from "@/actions/hrm.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { useRouter } from "next/navigation"
import { Button as PageHeaderButton } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Textarea } from "@/components/ui/shadcn/textarea"

export function CorrectPaidPayrollButton({ payrollId }: { payrollId: number }) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [reason, setReason] = useState("")

  const handleCorrect = () => {
    startTransition(async () => {
      try {
        const formData = new FormData()
        formData.set("reason", reason)
        const result = await correctPaidPayroll(payrollId, formData)
        if (!result.success) {
          showError(result.error || "Gagal mengoreksi penggajian")
          return
        }
        showSuccess("Dokumen koreksi penggajian berhasil diterbitkan!")
        setIsOpen(false)
        setReason("")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal mengoreksi penggajian")
      }
    })
  }

  return (
    <>
      <PageHeaderButton onPress={() => setIsOpen(true)} className="bg-warning text-warning-foreground hover:bg-warning-600 transition-colors">
        <FilePenLine size={14} /> Koreksi
      </PageHeaderButton>

      <ConfirmDialog
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        title="Koreksi Slip Dibayar?"
        variant="warning"
        confirmLabel={isPending ? "Memproses..." : "Ya, Terbitkan Koreksi"}
        cancelLabel="Batal"
        isPending={isPending}
        onConfirm={handleCorrect}
      >
        <span className="block mb-2">
          Slip asal tetap <strong>dibayar</strong>; sistem menerbitkan dokumen koreksi
          tertaut pada periode terbuka dengan nilai penuh slip asal.
          <br /><br />
          <strong>Perhatian:</strong> Jurnal asal dibalik dan koreksi hanya dapat
          diterbitkan satu kali.
        </span>
        <label className="block mb-2 text-sm font-medium" htmlFor="payroll-correction-reason">
          Alasan koreksi <span aria-hidden="true">*</span>
        </label>
        <Textarea
          id="payroll-correction-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Alasan koreksi (wajib)"
          aria-label="Alasan koreksi"
          aria-required="true"
        />
      </ConfirmDialog>
    </>
  )
}
