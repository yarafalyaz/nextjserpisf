"use client"

import { useTransition } from "react"
import { CheckCircle, Loader2, AlertTriangle } from "lucide-react"
import { approvePayroll } from "@/actions/hrm.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { useRouter } from "next/navigation"
import { Modal, Button, useOverlayState } from "@heroui/react"
import { Button as PageHeaderButton } from "@/components/ui/page-header"

export function ApprovePayrollButton({ payrollId }: { payrollId: number }) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const modalState = useOverlayState()

  const handleApprove = () => {
    startTransition(async () => {
      try {
        await approvePayroll(payrollId)
        showSuccess("Penggajian berhasil disetujui (Finalisasi)!")
        modalState.close()
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyetujui penggajian")
      }
    })
  }

  return (
    <>
      <PageHeaderButton onPress={modalState.open} className="bg-success text-white hover:bg-success-600 transition-colors">
        <CheckCircle size={14} /> Finalisasi (Approve)
      </PageHeaderButton>

      <Modal.Backdrop isOpen={modalState.isOpen} onOpenChange={modalState.setOpen} variant="blur">
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-sm">
            <Modal.CloseTrigger />
            <Modal.Header className="flex flex-col items-center text-center gap-1">
              <Modal.Icon className="bg-warning/20 text-warning mb-2">
                <AlertTriangle size={24} />
              </Modal.Icon>
              <Modal.Heading className="text-xl">Finalisasi Penggajian?</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="text-center text-muted px-6 pb-6">
              <p>
                Apakah Anda yakin ingin menyetujui (approve) slip gaji ini? 
                <br/><br/>
                <strong>Perhatian:</strong> Data yang sudah disetujui tidak dapat diubah (edit) lagi dan siap untuk ditandai sebagai dibayar.
              </p>
            </Modal.Body>
            <Modal.Footer className="flex-col gap-2">
              <Button
                className="w-full bg-success text-white font-medium"
                onPress={handleApprove}
                isDisabled={isPending}
              >
                {isPending ? (
                  <>
                    <Loader2 size={18} className="animate-spin mr-2" />
                    Memproses...
                  </>
                ) : (
                  "Ya, Finalisasi Sekarang"
                )}
              </Button>
              <Button
                className="w-full"
                variant="flat"
                onPress={modalState.close}
                isDisabled={isPending}
              >
                Batal
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </>
  )
}
