"use client"

import { useRouter } from "next/navigation"
import { useTransition, useState } from "react"
import { createBrand, updateBrand } from "@/actions/master.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { Button } from "@/components/ui/button"
import { X } from "lucide-react"
import { QuickAddSelect } from "@/components/ui/quick-add-select"
import { QUICK_ADD } from "@/lib/quick-add/registry"

interface BrandFormProps {
  categories: { id: number; name: string }[]
  brand?: { id: number; name: string; description: string | null }
  initialCategories?: { id: number; name: string }[]
}

/**
 * Form Merek bersama untuk tambah dan ubah. Beda mode hanya: aksi simpan
 * (createBrand vs updateBrand), pesan sukses, nilai awal field/kategori,
 * dan kerangka halaman — tambah membungkus breadcrumb + judul di dalam
 * form, ubah menyerahkan kerangka itu ke halamannya.
 */
export function BrandForm({ categories, brand, initialCategories = [] }: BrandFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [selectedCategories, setSelectedCategories] = useState<{ id: number; name: string }[]>(initialCategories)

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

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    formData.set("categoryIds", selectedCategories.map((c) => c.id).join(","))
    startTransition(async () => {
      try {
        if (brand) {
          await updateBrand(brand.id, formData)
          showSuccess("Merek berhasil diperbarui")
        } else {
          await createBrand(formData)
          showSuccess("Merek berhasil ditambahkan")
        }
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

  const form = (
    <form onSubmit={handleSubmit} className="bg-surface rounded-xl border border-default shadow-sm p-4 sm:p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Nama Merek *</Label>
          <Input id="name" name="name" placeholder="Nama merek" defaultValue={brand?.name} required />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Kategori Barang</Label>
          <QuickAddSelect
            options={availableCategories.map((c) => ({ value: String(c.id), label: c.name }))}
            value={null}
            onChange={addCategory}
            placeholder="Pilih kategori..."
            title={QUICK_ADD.itemCategory.title}
            fields={QUICK_ADD.itemCategory.fields}
            action={QUICK_ADD.itemCategory.action}
            onCreated={(created) => {
              setSelectedCategories((prev) =>
                prev.some((c) => c.id === created.id) ? prev : [...prev, { id: created.id, name: created.label }]
              )
            }}
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
          <Textarea id="description" name="description" rows={3} placeholder="Deskripsi merek (opsional)" defaultValue={brand ? (brand.description ?? "") : undefined} />
        </div>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3 mt-6 pt-5 border-t border-default">
        <Button className="w-full sm:w-auto" type="button" onPress={() => router.back()}>Batal</Button>
        <Button className="w-full sm:w-auto" type="submit" variant="primary" isDisabled={isPending} {...(brand ? {} : { id: "submit-brand" })}>
          {isPending ? "Menyimpan..." : brand ? "Perbarui" : "Simpan"}
        </Button>
      </div>
    </form>
  )

  if (brand) return form

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Data Master", href: "/master" },
        { label: "Merek", href: "/master/merek" },
        { label: "Buat" },
      ]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Tambah Merek</h1>
      </div>
      {form}
    </div>
  )
}
