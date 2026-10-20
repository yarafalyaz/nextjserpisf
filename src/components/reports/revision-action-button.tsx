"use client"

import type { ComponentType } from "react"
import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { showError, showSuccess } from "@/lib/utils/toast"
import { Button } from "@/components/ui/button"

type RevisionActionResult = { success: boolean; error?: string; slug?: string | null; id?: number }

/**
 * Tombol aksi revisi penawaran bersama (F-10 selisih / F-59 revisi-turun).
 * Server menentukan kelayakan + nominal; komponen hanya meneruskan klik dan
 * menampilkan error server apa adanya. Bentuk kontrak didefinisikan sesuai
 * karena createDifferenceInvoice dan createRevisionDownCredit sama-sama
 * mengembalikan hasil sukses/gagal; createDifferenceInvoice membawa slug
 * faktur hasil, createRevisionDownCredit membawa id saja — jadi bila slug
 * kosong ia jatuh ke `router.refresh()`. Param `onSuccess` dapat dipakai
 * untuk arah kustom. Saat ini tak ada pemakai override karena perilaku
 * callback bawaan sudah persis sama seperti kedua tombol lama.
 */
export function RevisionActionButton({
  quotationId,
  revisionNumber,
  action,
  label,
  successMessage,
  errorMessage,
  Icon,
  onSuccess,
  silentSuccess,
}: Readonly<{
  quotationId: number
  revisionNumber: number
  action: (quotationId: number) => Promise<RevisionActionResult>
  label: string
  successMessage: string
  errorMessage: string
  Icon: ComponentType<{ size?: number | string; "aria-hidden"?: boolean | "true" | "false" }>
  onSuccess?: (router: ReturnType<typeof useRouter>, result: RevisionActionResult) => void
  silentSuccess?: boolean
}>) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  if (revisionNumber <= 0) {
    return null
  }

  function handleClick() {
    startTransition(async () => {
      const result = await action(quotationId)
      if (!result.success) {
        showError(result.error || errorMessage)
        return
      }
      if (!silentSuccess) {
        showSuccess(successMessage)
      }
      if (onSuccess) {
        onSuccess(router, result)
      } else if (result.slug) {
        router.push(`/penjualan/faktur/${result.slug}`)
      } else {
        router.refresh()
      }
    })
  }

  return (
    <Button
      variant="secondary"
      onPress={handleClick}
      isPending={isPending}
      aria-label={`Buat ${label.toLowerCase()}`}
    >
      <Icon size={14} aria-hidden="true" /> Buat {label}
    </Button>
  )
}
