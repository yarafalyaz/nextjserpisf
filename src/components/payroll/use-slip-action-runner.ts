"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { showError, showSuccess } from "@/lib/utils/toast"

/**
 * Runner aksi baris slip (komponen gaji + komisi): transisi + toast +
 * refresh. Satu sumber — duplikasi new-code Sonar bila ditulis per panel.
 */
export function useSlipActionRunner(failMessage: string) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function run(fn: () => Promise<{ success: boolean; error?: string }>, ok: string) {
    startTransition(async () => {
      try {
        const result = await fn()
        if (!result.success) {
          showError(result.error || failMessage)
          return
        }
        showSuccess(ok)
        router.refresh()
      } catch {
        showError(failMessage)
      }
    })
  }

  return { isPending, run }
}
