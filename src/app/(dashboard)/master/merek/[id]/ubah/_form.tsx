"use client"

import { useRouter } from "next/navigation"
import { useTransition, useState } from "react"
import { updateBrand } from "@/actions/master.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { Button } from "@/components/ui/button"
import { X } from "lucide-react"
import { QuickAddSelect } from "@/components/ui/quick-add-select"
import { QUICK_ADD } from "@/lib/quick-add/registry"

interface BrandEditFormProps {
  brand: { id: number; name: string; description: string | null }
  allCategories: { id: number; name: string }[]
  initialCategories: { id: number; name: string }[]
}

export function BrandEditForm({ brand, allCategories, initialCategories }: BrandEditFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [selectedCategories, setSelectedCategories] = useState<{ id: number; name: string }[]>(initialCategories)

  function addCategory(key: string | null) {
    if (!key) return
    const id = Number(key)
    if (selectedCategories.some((c) => c.id === id)) return
    const cat = allCategories.find((c) => c.id === id)
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
        await updateBrand(brand.id, formData)
        showSuccess("Merek berhasil diperbarui")
        router.push("/master/merek")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan data")
      }
    })
  }

  const availableCategories = allCategories.filter(
    (c) => !selectedCategories.some((s) => s.id === c.id)
  )

  return (
    <form onSubmit={handleSubmit} className="bg-surface rounded-xl border border-default shadow-sm p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Nama Merek *</Label>
          <Input id="name" name="name" placeholder="Nama merek" defaultValue={brand.name} required />
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
          <Textarea id="description" name="description" rows={3} placeholder="Deskripsi merek (opsional)" defaultValue={brand.description ?? ""} />
        </div>
      </div>

      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <Button type="button" onPress={() => router.back()}>Batal</Button>
        <Button type="submit" variant="primary" isDisabled={isPending}>
          {isPending ? "Menyimpan..." : "Perbarui"}
        </Button>
      </div>
    </form>
  )
}
