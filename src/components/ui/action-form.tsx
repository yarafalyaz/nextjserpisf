"use client"

import type { ReactNode } from "react"
import { useActionState } from "react"

type ActionResult = { success: false; error: string } | void

/**
 * Form untuk server action yang mengembalikan `{ success: false, error }`.
 *
 * Alasannya ada: pesan validasi harus tampil DI DALAM form (input pengguna tetap
 * ada). Sebelumnya action melempar `Error`, sehingga satu nama peran yang
 * ditolak menggantikan seluruh halaman dengan error boundary dan isian form
 * hilang. Galat tak terduga tetap di-throw supaya error boundary tetap bekerja.
 */
export function ActionForm({
  action,
  children,
  className,
}: {
  action: (formData: FormData) => Promise<ActionResult>
  children: ReactNode
  className?: string
}) {
  const [error, formAction] = useActionState(
    async (_previous: string | null, formData: FormData) => {
      const result = await action(formData)
      return result && result.success === false ? result.error : null
    },
    null,
  )

  return (
    <form action={formAction} className={className}>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-foreground"
        >
          {error}
        </p>
      )}
      {children}
    </form>
  )
}
