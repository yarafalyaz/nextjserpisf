"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { updatePaymentTerm } from "@/actions/master.actions"
import { Input, Label } from "@heroui/react"

interface EditPaymentTermFormProps {
  paymentTerm: {
    id: number
    name: string
    code: string
    days: number
  }
}

export function EditPaymentTermForm({ paymentTerm }: EditPaymentTermFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      await updatePaymentTerm(paymentTerm.id, formData)
      router.push("/master/payment-terms")
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface rounded-xl border border-default shadow-sm p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Nama Termin *</Label>
          <Input id="name" name="name" placeholder="Contoh: Net 30" required defaultValue={paymentTerm.name} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="code">Kode *</Label>
          <Input id="code" name="code" placeholder="Contoh: NET30" required defaultValue={paymentTerm.code} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="days">Jumlah Hari</Label>
          <Input id="days" name="days" type="number" placeholder="0" defaultValue={paymentTerm.days} min={0} />
        </div>
      </div>

      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <button type="button" onClick={() => router.back()} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all">Batal</button>
        <button type="submit" disabled={isPending} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="submit-payment-term">
          {isPending ? "Menyimpan..." : "Update"}
        </button>
      </div>
    </form>
  )
}
