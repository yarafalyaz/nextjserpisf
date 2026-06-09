"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { createItemCategory } from "@/actions/master.actions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { Input } from "@/components/ui/shadcn/input"
import { Label } from "@/components/ui/shadcn/label"
import { Button } from "@/components/ui/page-header"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Kategori Barang" }


export default function CreateItemCategoryPage() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      await createItemCategory(formData)
      router.push("/master/kategori-barang")
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Master Data", href: "/master" },
  { label: "Kategori Barang", href: "/master/kategori-barang" },
  { label: "Buat" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tambah Kategori Barang</h1>
      </div>
      <form onSubmit={handleSubmit} className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Nama Kategori *</Label>
            <Input id="name" name="name" placeholder="Nama kategori" required />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Deskripsi</Label>
            <Input id="description" name="description" placeholder="Deskripsi kategori" />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
          <Button type="button" onPress={() => router.back()}>Batal</Button>
          <Button type="submit" variant="primary" isDisabled={isPending} id="submit-item-category">
            {isPending ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
      </form>
    </div>
  )
}
