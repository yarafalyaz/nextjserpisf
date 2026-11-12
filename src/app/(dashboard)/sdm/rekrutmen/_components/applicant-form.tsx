"use client"

import { useRouter } from "next/navigation"
import { useRef, useTransition } from "react"
import { createApplicant } from "@/actions/recruitment.actions"
import { showError, showSuccess } from "@/lib/utils/toast"
import { Input } from "@/components/ui/shadcn/input"

export function ApplicantForm({ vacancyId }: { vacancyId: number }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID())

  function onSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)
    formData.set("vacancyId", String(vacancyId))
    formData.set("idempotencyKey", idempotencyKeyRef.current)
    startTransition(async () => {
      try {
        const result = await createApplicant(formData)
        if (!result?.success) throw new Error(result?.error || "Gagal menambah pelamar")
        idempotencyKeyRef.current = crypto.randomUUID()
        showSuccess("Pelamar ditambahkan")
        form.reset()
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menambah pelamar")
      }
    })
  }

  return (
    <form onSubmit={onSubmit} aria-busy={isPending} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <Input name="name" required placeholder="Nama pelamar *" />
      <Input name="email" type="email" placeholder="Email" />
      <Input name="phone" placeholder="Telepon" />
      <Input name="source" placeholder="Sumber (cth. JobStreet, Referral)" />
      <Input name="cvReference" placeholder="Referensi CV (tautan/nama berkas)" />
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex items-center justify-center min-h-11 sm:min-h-9 px-4 py-2 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
      >
        {isPending ? "Menyimpan..." : "Tambah Pelamar"}
      </button>
    </form>
  )
}
