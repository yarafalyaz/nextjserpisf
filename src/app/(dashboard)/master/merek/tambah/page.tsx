"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { createBrand } from "@/actions/master.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { Input, Label } from "@heroui/react"
import { Button } from "@/components/ui/page-header"

export default function CreateBrandPage() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      try {
        await createBrand(formData)
        showSuccess("Brand berhasil ditambahkan")
        router.push("/master/merek")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan data")
      }
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dashboard", href: "/" },
        { label: "Master Data", href: "/master" },
        { label: "Brands", href: "/master/merek" },
        { label: "Create" },
      ]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tambah Brand</h1>
      </div>
      <form onSubmit={handleSubmit} className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Nama Brand *</Label>
            <Input id="name" name="name" placeholder="Nama brand" required />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
          <Button type="button" onPress={() => router.back()} >Batal</Button>
          <Button type="submit" variant="primary" isDisabled={isPending} id="submit-brand">
            {isPending ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
      </form>
    </div>
  )
}
