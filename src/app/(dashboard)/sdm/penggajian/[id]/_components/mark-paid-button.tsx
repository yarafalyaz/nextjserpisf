"use client"

import { useTransition } from "react"
import { Banknote, Loader2, AlertTriangle } from "lucide-react"
import { markPayrollPaid } from "@/actions/hrm.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { useRouter } from "next/navigation"
import { Modal, Button, useOverlayState } from "@heroui/react"
import { Button as PageHeaderButton } from "@/components/ui/page-header"

export function MarkPaidPayrollButton({ payrollId }: { payrollId: number }) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const modalState = useOverlayState()

  const handleMarkPaid = () => {
    startTransition(async () => {
      try {
        await markPayrollPaid(payrollId)
        showSuccess("Penggajian berhasil ditandai sebagai dibayar!")
        modalState.close()
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menandai penggajian sebagai dibayar")
      }
    })
  }

  return (
    <>
      <PageHeaderButton onPress={modalState.open} className="bg-primary text-white hover:bg-primary-600 transition-colors">
        <Banknote size={14} /> Tandai Dibayar
      </PageHeaderButton>

      <Modal.Backdrop isOpen={modalState.isOpen} onOpenChange={modalState.setOpen} variant="blur">
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-sm">
            <Modal.CloseTrigger />
            <Modal.Header className="flex flex-col items-center text-center gap-1">
              <Modal.Icon className="bg-primary/20 text-primary mb-2">
                <AlertTriangle size={24} />
              </Modal.Icon>
              <Modal.Heading className="text-xl">Tandai Dibayar?</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="text-center text-muted px-6 pb-6">
              <p>
                Apakah Anda yakin ingin menandai slip gaji ini sebagai <strong>dibayar</strong>?
                <br/><br/>
                <strong>Perhatian:</strong> Status ini tidak dapat dibatalkan.
              </p>
            </Modal.Body>
            <Modal.Footer className="flex-col gap-2">
              <Button
                className="w-full bg-primary text-white font-medium"
                onPress={handleMarkPaid}
                isDisabled={isPending}
              >
                {isPending ? (
                  <>
                    <Loader2 size={18} className="animate-spin mr-2" />
                    Memproses...
                  </>
                ) : (
                  "Ya, Tandai Dibayar"
                )}
              </Button>
              <Button
                className="w-full"
                variant="secondary"
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
