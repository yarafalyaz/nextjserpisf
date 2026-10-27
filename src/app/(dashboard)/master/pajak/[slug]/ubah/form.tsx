"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { updateTax } from "@/actions/master.actions"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Button } from "@/components/ui/button"

interface TaxEditFormProps {
  tax: { id: number; name: string; rate: number }
}

export function TaxEditForm({ tax }: TaxEditFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      await updateTax(tax.id, formData)
      router.push("/master/pajak")
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface rounded-xl border border-default shadow-sm p-4 sm:p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Nama *</Label>
          <Input id="name" name="name" required defaultValue={tax.name} placeholder="Nama pajak" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rate">Tarif (%) *</Label>
          <Input id="rate" name="rate" type="number" step="0.01" required defaultValue={tax.rate} placeholder="0.00" />
        </div>
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3 mt-6 pt-5 border-t border-default">
        <Button className="w-full sm:w-auto" type="button" onPress={() => router.back()} >Batal</Button>
        <Button className="w-full sm:w-auto" type="submit" variant="primary" isDisabled={isPending}>
          {isPending ? "Menyimpan..." : "Perbarui"}
        </Button>
      </div>
    </form>
  )
}
