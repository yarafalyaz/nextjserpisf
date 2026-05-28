"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { updateCurrency } from "@/actions/master.actions"
import { Input, Label } from "@heroui/react"
import { Button } from "@/components/ui/page-header"

interface CurrencyEditFormProps {
  currency: { id: number; code: string; name: string; rate: number }
}

export function CurrencyEditForm({ currency }: CurrencyEditFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      await updateCurrency(currency.id, formData)
      router.push("/master/mata-uang")
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface rounded-xl border border-default shadow-sm p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5">
          <Label>Kode *</Label>
          <Input name="code" required defaultValue={currency.code} placeholder="USD, IDR, dll" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Nama *</Label>
          <Input name="name" required defaultValue={currency.name} placeholder="Nama mata uang" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Rate *</Label>
          <Input name="rate" type="number" step="0.0001" required defaultValue={currency.rate} placeholder="0.0000" />
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <Button type="button" onPress={() => router.back()} >Batal</Button>
        <Button type="submit" variant="primary" isDisabled={isPending}>
          {isPending ? "Menyimpan..." : "Update"}
        </Button>
      </div>
    </form>
  )
}
