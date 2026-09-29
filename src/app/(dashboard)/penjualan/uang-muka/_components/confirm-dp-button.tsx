"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { confirmDownPayment } from "@/actions/sales.actions"
import { showSuccess, showError } from "@/lib/utils/toast"

interface ConfirmDownPaymentButtonProps {
  dpId: number
}

export function ConfirmDownPaymentButton({ dpId }: ConfirmDownPaymentButtonProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleConfirm() {
    startTransition(async () => {
      try {
        const result = await confirmDownPayment(dpId)
        if (result && !result.success) {
          showError(result.error || "Gagal konfirmasi uang muka")
          return
        }
        showSuccess("Uang muka berhasil dikonfirmasi")
        router.refresh()
      } catch (e) {
        showError(e instanceof Error ? e.message : "Gagal konfirmasi uang muka")
      }
    })
  }

  return (
    <Button
      type="button"
      variant="success"
      isDisabled={isPending}
      isPending={isPending}
      onPress={handleConfirm}
      id="confirm-dp-btn"
    >
      <Check size={14} aria-hidden="true" />
      {isPending ? "Mengonfirmasi..." : "Konfirmasi"}
    </Button>
  )
}
