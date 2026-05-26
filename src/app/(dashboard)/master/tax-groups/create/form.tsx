"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { createTaxGroup } from "@/actions/master.actions"

interface Props {
  taxes: { id: number; name: string; rate: number }[]
}

export function TaxGroupForm({ taxes }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      await createTaxGroup(formData)
      router.push("/master/tax-groups")
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface rounded-xl border border-default shadow-sm p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="name" className="text-sm font-medium text-foreground">Nama Grup *</label>
          <input id="name" name="name" className="form-input" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">Pajak</label>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {taxes.map((tax) => (
              <label key={tax.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <input type="checkbox" name="taxIds" value={tax.id} />
                {tax.name} ({tax.rate}%)
              </label>
            ))}
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <button type="button" onClick={() => router.back()} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all">Batal</button>
        <button type="submit" disabled={isPending} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">
          {isPending ? "Menyimpan..." : "Simpan"}
        </button>
      </div>
    </form>
  )
}
