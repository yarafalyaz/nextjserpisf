"use client"

import type { ReactNode } from "react"
import { useActionState, useEffect, useRef } from "react"

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
  const [error, formAction, isPending] = useActionState(
    async (_previous: string | null, formData: FormData) => {
      const result = await action(formData)
      return result && result.success === false ? result.error : null
    },
    null,
  )
  const errorRef = useRef<HTMLParagraphElement>(null)

  // Pindahkan fokus ke pesan galat saat muncul supaya pengguna keyboard/SR
  // langsung tahu pengiriman gagal — sebelumnya <p role="alert"> dirender di
  // atas form tapi fokus tetap di tombol submit, sehingga tanpa SR yang
  // mengumumkan live region, kegagalan tidak terlihat.
  useEffect(() => {
    if (error) errorRef.current?.focus()
  }, [error])

  return (
    <form action={formAction} className={className} aria-busy={isPending || undefined}>
      {error && (
        <p
          ref={errorRef}
          role="alert"
          tabIndex={-1}
          className="rounded-lg border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
        >
          {error}
        </p>
      )}
      {children}
    </form>
  )
}
