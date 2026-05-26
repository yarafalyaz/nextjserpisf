"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { updateBank } from "@/actions/master.actions"

interface EditBankFormProps {
  bank: {
    id: number
    name: string
    code: string
    accountId: number | null
  }
}

export function EditBankForm({ bank }: EditBankFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      await updateBank(bank.id, formData)
      router.push("/master/banks")
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface rounded-xl border border-default shadow-sm p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="name" className="text-sm font-medium text-foreground">Nama Bank *</label>
          <input id="name" name="name" className="form-input" placeholder="Contoh: Bank BCA" required defaultValue={bank.name} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="code" className="text-sm font-medium text-foreground">Kode Bank *</label>
          <input id="code" name="code" className="form-input" placeholder="Contoh: BCA" required defaultValue={bank.code} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="accountId" className="text-sm font-medium text-foreground">Akun (COA)</label>
          <input id="accountId" name="accountId" type="number" className="form-input" placeholder="ID Akun (opsional)" defaultValue={bank.accountId || ""} />
        </div>
      </div>

      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <button type="button" onClick={() => router.back()} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all">Batal</button>
        <button type="submit" disabled={isPending} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="submit-bank">
          {isPending ? "Menyimpan..." : "Update"}
        </button>
      </div>
    </form>
  )
}
