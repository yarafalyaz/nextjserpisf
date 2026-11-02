"use client"

import { useRouter } from "next/navigation"
import { useRef, useTransition } from "react"
import { addTicketComment } from "@/actions/crm.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/shadcn/label"
import { Textarea } from "@/components/ui/shadcn/textarea"

// Satu-satunya UI yang memanggil addTicketComment. Sebelum ini halaman detail
// tiket merender daftar komentar beserta keadaan kosongnya, tetapi tidak ada cara
// menambahkan komentar sama sekali: tabel `crm_ticket_comments` tidak punya penulis.

export function TicketCommentForm({ ticketId, canCreate = true }: { ticketId: number; canCreate?: boolean }) {
  const router = useRouter()
  // Idempotency: key stabil per intent; retry jaringan memakai key sama
  // (ditolak server). Dirotasi sesudah sukses karena form di-reset in-place
  // dan komentar berikutnya adalah intent baru yang sah.
  const idempotencyKeyRef = useRef<string | null>(null)
  if (idempotencyKeyRef.current === null) idempotencyKeyRef.current = crypto.randomUUID()
  const [isPending, startTransition] = useTransition()

  function onSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    startTransition(async () => {
      const fd = new FormData(form)
      fd.set("idempotencyKey", idempotencyKeyRef.current!)
      const res = await addTicketComment(ticketId, fd)
      if (!res.success) {
        showError(res.error || "Gagal menambahkan komentar")
        return
      }
      idempotencyKeyRef.current = crypto.randomUUID()
      showSuccess("Komentar ditambahkan")
      form.reset()
      router.refresh()
    })
  }

  if (!canCreate) return null

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-3 p-4 px-5 border-b border-default"
      aria-label="Tambah komentar"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="commentBody">Komentar</Label>
        <Textarea
          id="commentBody"
          name="body"
          rows={3}
          required
          placeholder="Tuliskan komentar atau tindak lanjut..."
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            name="isInternal"
            value="on"
            className="h-4 w-4 rounded border-default"
          />
          Catatan internal (tidak untuk pelanggan)
        </label>
        <Button type="submit" variant="primary" isDisabled={isPending}>
          {isPending ? "Menyimpan..." : "Tambah Komentar"}
        </Button>
      </div>
    </form>
  )
}
