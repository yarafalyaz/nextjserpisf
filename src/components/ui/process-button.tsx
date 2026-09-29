"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { showSuccess, showError } from "@/lib/utils/toast"

interface ProcessButtonProps {
  id: number
  action: (id: number) => Promise<{ success: boolean; error?: string } | void>
  confirmTitle?: string
  confirmBody?: string
  successMessage?: string
  label?: string
}

export function ProcessButton({
  id,
  action,
  confirmTitle = "Posting data ini?",
  confirmBody = "Data yang diposting akan meng-update stok dan jurnal keuangan. Pastikan data sudah benar.",
  successMessage = "Data berhasil diposting",
  label = "Posting",
}: ProcessButtonProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isOpen, setIsOpen] = useState(false)

  function handleProcess() {
    startTransition(async () => {
      try {
        const result = await action(id)
        if (result && result.success === false) {
          showError(result.error || "Gagal memproses data")
          setIsOpen(false)
          return
        }
        showSuccess(successMessage)
        setIsOpen(false)
        router.refresh()
      } catch (e) {
        if (e && typeof e === "object" && "digest" in e && String((e as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT")) {
          throw e
        }
        showError(e instanceof Error ? e.message : "Gagal memproses data")
        setIsOpen(false)
      }
    })
  }

  return (
    <>
      <Button
        variant="primary"
        onPress={() => setIsOpen(true)}
        isDisabled={isPending}
      >
        <Check size={16} className="mr-1.5" />
        {label}
      </Button>

      <ConfirmDialog
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        title={confirmTitle}
        body={confirmBody}
        confirmLabel={label}
        cancelLabel="Batal"
        variant="primary"
        isPending={isPending}
        onConfirm={handleProcess}
      />
    </>
  )
}
