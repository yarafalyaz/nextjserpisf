"use client"
export const dynamic = "force-dynamic"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { createPaymentTerm } from "@/actions/master.actions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Button } from "@/components/ui/page-header"


export default function CreatePaymentTermPage() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      await createPaymentTerm(formData)
      router.push("/master/syarat-pembayaran")
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Master Data", href: "/master" },
  { label: "Termin Pembayaran", href: "/master/syarat-pembayaran" },
  { label: "Buat" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tambah Termin Pembayaran</h1>
      </div>
      <form onSubmit={handleSubmit} className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Nama Termin *</Label>
            <Input id="name" name="name" placeholder="Contoh: Net 30" required />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="code">Kode *</Label>
            <Input id="code" name="code" placeholder="Contoh: NET30" required />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="days">Jumlah Hari</Label>
            <Input id="days" name="days" type="number" placeholder="0" defaultValue={0} min={0} />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
          <Button type="button" onPress={() => router.back()} >Batal</Button>
          <Button type="submit" variant="primary" isDisabled={isPending} id="submit-payment-term">
            {isPending ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
      </form>
    </div>
  )
}
