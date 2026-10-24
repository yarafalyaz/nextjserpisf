"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { showError, showSuccess } from "@/lib/utils/toast"

type ActionResult = { success: boolean; error?: string }

/** Runner aksi mutasi bersama panel laporan: toast server verbatim + refresh. */
export function useActionRunner(fallbackError: string) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function run(fn: () => Promise<ActionResult>, okMsg: string, after?: () => void) {
    startTransition(async () => {
      try {
        const res = await fn()
        if (res?.success) {
          showSuccess(okMsg)
          after?.()
          router.refresh()
        } else {
          showError(res?.error || fallbackError)
        }
      } catch (e) {
        showError(e instanceof Error ? e.message : fallbackError)
      }
    })
  }

  return { isPending, startTransition, run }
}
