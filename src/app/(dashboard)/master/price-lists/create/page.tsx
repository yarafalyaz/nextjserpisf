"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { createPriceList } from "@/actions/master.actions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { Input, TextArea, Label } from "@heroui/react"

export default function CreatePriceListPage() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      await createPriceList(formData)
      router.push("/master/price-lists")
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Master Data", href: "/master" },
  { label: "Price Lists", href: "/master/price-lists" },
  { label: "Create" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tambah Daftar Harga</h1>
      </div>
      <form onSubmit={handleSubmit} className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Nama *</Label>
            <Input id="name" name="name" placeholder="Nama daftar harga" required />
          </div>

          <div className="flex flex-col gap-1.5 col-span-full">
            <Label htmlFor="description">Deskripsi</Label>
            <TextArea id="description" name="description" rows={3} placeholder="Deskripsi (opsional)" />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
          <button type="button" onClick={() => router.back()} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all">Batal</button>
          <button type="submit" disabled={isPending} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="submit-price-list">
            {isPending ? "Menyimpan..." : "Simpan"}
          </button>
        </div>
      </form>
    </div>
  )
}
