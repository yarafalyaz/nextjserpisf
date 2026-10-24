"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { showError, showSuccess } from "@/lib/utils/toast"
import { Button } from "@/components/ui/button"
import { publishPhotoAttachment, verifyPhotoAttachment } from "@/actions/attachment-photo.actions"

/**
 * F-2026-10-24-096-S: tombol verifikasi/terbit foto. Izin digerbang pemanggil
 * (server, lewat hasPermission); aksi menegakkan ulang + aturan transisi.
 * Error server tampil apa adanya.
 */
export function PhotoVerifyPublishButtons({
  attachmentId,
  photoName,
  isVerified,
  canVerify,
  canPublish,
  publishable,
}: Readonly<{
  attachmentId: number
  photoName: string
  isVerified: boolean
  canVerify: boolean
  canPublish: boolean
  publishable: boolean
}>) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function run(kind: "verify" | "publish") {
    startTransition(async () => {
      try {
        if (kind === "verify") await verifyPhotoAttachment(attachmentId)
        else await publishPhotoAttachment(attachmentId)
        showSuccess(kind === "verify" ? "Foto terverifikasi" : "Foto ditandai terbit")
        router.refresh()
      } catch (err) {
        showError(err instanceof Error ? err.message : "Aksi foto gagal")
      }
    })
  }

  if (!canVerify && !canPublish) return null
  return (
    <span className="flex flex-wrap gap-2">
      {canVerify && !isVerified ? (
        <Button
          variant="secondary"
          size="sm"
          onPress={() => run("verify")}
          isPending={isPending}
          aria-label={`Verifikasi foto ${photoName}`}
        >
          Verifikasi
        </Button>
      ) : null}
      {canPublish && isVerified && publishable ? (
        <Button
          variant="secondary"
          size="sm"
          onPress={() => run("publish")}
          isPending={isPending}
          aria-label={`Tandai terbit foto ${photoName}`}
        >
          Tandai terbit
        </Button>
      ) : null}
    </span>
  )
}
