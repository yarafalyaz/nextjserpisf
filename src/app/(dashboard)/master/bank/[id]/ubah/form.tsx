"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { updateBank } from "@/actions/master.actions"
import { Input, Label } from "@heroui/react"
import { Button } from "@/components/ui/page-header"

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
      router.push("/master/bank")
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface rounded-xl border border-default shadow-sm p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Nama Bank *</Label>
          <Input id="name" name="name" placeholder="Contoh: Bank BCA" required defaultValue={bank.name} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="code">Kode Bank *</Label>
          <Input id="code" name="code" placeholder="Contoh: BCA" required defaultValue={bank.code} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="accountId">Akun (COA)</Label>
          <Input id="accountId" name="accountId" type="number" placeholder="ID Akun (opsional)" defaultValue={bank.accountId || ""} />
        </div>
      </div>

      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <Button type="button" onPress={() => router.back()} >Batal</Button>
        <Button type="submit" variant="primary" isDisabled={isPending} id="submit-bank">
          {isPending ? "Menyimpan..." : "Update"}
        </Button>
      </div>
    </form>
  )
}
