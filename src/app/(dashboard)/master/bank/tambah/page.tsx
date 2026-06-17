"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { createBank } from "@/actions/master.actions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { Input } from "@/components/ui/shadcn/input"
import { Label } from "@/components/ui/shadcn/label"
import { FormSelect } from "@/components/ui/form-select"
import { Button } from "@/components/ui/button"


export default function CreateBankPage() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      await createBank(formData)
      router.push("/master/bank")
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Master Data", href: "/master" },
  { label: "Bank", href: "/master/bank" },
  { label: "Buat" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tambah Bank</h1>
      </div>
      <form onSubmit={handleSubmit} className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Nama Bank *</Label>
            <Input id="name" name="name" placeholder="Contoh: Bank BCA" required />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="code">Kode Bank *</Label>
            <Input id="code" name="code" placeholder="Contoh: BCA" required />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="type">Tipe *</Label>
            <FormSelect
              id="type"
              name="type"
              defaultValue="bank"
              options={[
                { value: "bank", label: "Bank" },
                { value: "emoney", label: "E-Money" },
              ]}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="accountId">Akun (COA)</Label>
            <Input id="accountId" name="accountId" type="number" placeholder="ID Akun (opsional)" />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
          <Button type="button" onPress={() => router.back()} >Batal</Button>
          <Button type="submit" variant="primary" isDisabled={isPending} id="submit-bank">
            {isPending ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
      </form>
    </div>
  )
}
