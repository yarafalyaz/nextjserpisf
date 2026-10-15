"use client"

import type { ComponentProps, ReactNode } from "react"
import { useFormStatus } from "react-dom"

import { Button } from "@/components/ui/button"

/**
 * Tombol submit untuk form ber-`action` server action.
 *
 * `useFormStatus()` membaca status form induknya, jadi tombol ini otomatis
 * nonaktif + berputar selama action berjalan — tanpa tiap halaman menyimpan
 * state pending sendiri. Tanpa penjaga ini, klik dua kali mengirim aksi dua
 * kali (peran/approval dibuat atau diproses ganda).
 */
export function SubmitButton({
  children,
  pendingLabel = "Menyimpan...",
  ...props
}: Omit<ComponentProps<typeof Button>, "type"> & {
  children: ReactNode
  pendingLabel?: string
}) {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" isPending={pending} {...props}>
      {pending ? pendingLabel : children}
    </Button>
  )
}
