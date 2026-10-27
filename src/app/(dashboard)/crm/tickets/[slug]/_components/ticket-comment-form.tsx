"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { addTicketComment } from "@/actions/crm.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/shadcn/label"
import { Textarea } from "@/components/ui/shadcn/textarea"

// Satu-satunya UI yang memanggil addTicketComment. Sebelum ini halaman detail
// tiket merender daftar komentar beserta keadaan kosongnya, tetapi tidak ada cara
// menambahkan komentar sama sekali: tabel `crm_ticket_comments` tidak punya penulis.

export function TicketCommentForm({ ticketId }: { ticketId: number }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    startTransition(async () => {
      const res = await addTicketComment(ticketId, new FormData(form))
      if (!res.success) {
        showError(res.error || "Gagal menambahkan komentar")
        return
      }
      showSuccess("Komentar ditambahkan")
      form.reset()
      router.refresh()
    })
  }

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
