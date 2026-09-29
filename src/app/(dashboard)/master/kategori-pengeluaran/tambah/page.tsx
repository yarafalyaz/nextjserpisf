"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { showSuccess, showError } from "@/lib/utils/toast"
import { createExpenseCategory } from "@/actions/expense-category.actions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Button } from "@/components/ui/button"

export default function CreateExpenseCategoryPage() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      try {
        const result = await createExpenseCategory(formData)
        if (result && !result.success) {
          showError(result.error || "Gagal menyimpan")
          return
        }
        showSuccess("Kategori berhasil ditambahkan")
        router.push("/master/kategori-pengeluaran")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan")
      }
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Master Data", href: "/master" },
          { label: "Kategori Pengeluaran", href: "/master/kategori-pengeluaran" },
          { label: "Tambah" },
        ]}
      />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tambah Kategori Pengeluaran</h1>
      </div>
      <form onSubmit={onSubmit} className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Nama (slug) *</Label>
            <Input id="name" name="name" required placeholder="Contoh: csr" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="label">Label *</Label>
            <Input id="label" name="label" required placeholder="Contoh: CSR / Donasi" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sortOrder">Urutan</Label>
            <Input id="sortOrder" name="sortOrder" type="number" defaultValue={0} />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
          <Button type="button" onPress={() => router.back()}>
            Batal
          </Button>
          <Button type="submit" variant="primary" isDisabled={isPending}>
            {isPending ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
      </form>
    </div>
  )
}
