"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { createApplicant } from "@/actions/recruitment.actions"
import { showError, showSuccess } from "@/lib/utils/toast"

export function ApplicantForm({ vacancyId }: { vacancyId: number }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)
    formData.set("vacancyId", String(vacancyId))
    startTransition(async () => {
      try {
        const result = await createApplicant(formData)
        if (!result?.success) throw new Error(result?.error || "Gagal menambah pelamar")
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
      <input name="name" required placeholder="Nama pelamar *" className="form-input" />
      <input name="email" type="email" placeholder="Email" className="form-input" />
      <input name="phone" placeholder="Telepon" className="form-input" />
      <input name="source" placeholder="Sumber (cth. JobStreet, Referral)" className="form-input" />
      <input name="cvReference" placeholder="Referensi CV (tautan/nama berkas)" className="form-input" />
      <button type="submit" disabled={isPending} className="btn-primary px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
        {isPending ? "Menyimpan..." : "Tambah Pelamar"}
      </button>
    </form>
  )
}
