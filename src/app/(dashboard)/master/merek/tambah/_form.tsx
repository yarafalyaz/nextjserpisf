"use client"

import { useRouter } from "next/navigation"
import { useTransition, useState } from "react"
import { createBrand } from "@/actions/master.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { Button } from "@/components/ui/button"
import { X } from "lucide-react"
import { Combobox } from "@/components/ui/combobox"

interface CreateBrandFormProps {
  categories: { id: number; name: string }[]
}

export default function CreateBrandForm({ categories }: CreateBrandFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [selectedCategories, setSelectedCategories] = useState<{ id: number; name: string }[]>([])

  function addCategory(key: string | null) {
    if (!key) return
    const id = Number(key)
    if (selectedCategories.some((c) => c.id === id)) return
    const cat = categories.find((c) => c.id === id)
    if (cat) setSelectedCategories((prev) => [...prev, cat])
  }

  function removeCategory(id: number) {
    setSelectedCategories((prev) => prev.filter((c) => c.id !== id))
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    formData.set("categoryIds", selectedCategories.map((c) => c.id).join(","))
    startTransition(async () => {
      try {
        await createBrand(formData)
        showSuccess("Merek berhasil ditambahkan")
        router.push("/master/merek")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan data")
      }
    })
  }

  const availableCategories = categories.filter(
    (c) => !selectedCategories.some((s) => s.id === c.id)
  )

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Master Data", href: "/master" },
        { label: "Merek", href: "/master/merek" },
        { label: "Buat" },
      ]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tambah Merek</h1>
      </div>
      <form onSubmit={handleSubmit} className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Nama Merek *</Label>
            <Input id="name" name="name" placeholder="Nama merek" required />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Kategori Barang</Label>
            <Combobox
              options={availableCategories.map((c) => ({ value: String(c.id), label: c.name }))}
              value={null}
              onChange={addCategory}
              placeholder="Pilih kategori..."
            />
            {selectedCategories.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1">
                {selectedCategories.map((cat) => (
                  <span
                    key={cat.id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20"
                  >
                    {cat.name}
                    <button
                      type="button"
                      onClick={() => removeCategory(cat.id)}
                      className="hover:text-danger transition-colors"
                      aria-label={`Hapus kategori ${cat.name}`}
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {selectedCategories.length === 0 && (
              <span className="text-xs text-muted-foreground">Belum ada kategori dipilih</span>
            )}
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="description">Deskripsi</Label>
            <Textarea id="description" name="description" rows={3} placeholder="Deskripsi merek (opsional)" />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
          <Button type="button" onPress={() => router.back()}>Batal</Button>
          <Button type="submit" variant="primary" isDisabled={isPending} id="submit-brand">
            {isPending ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
      </form>
    </div>
  )
}
