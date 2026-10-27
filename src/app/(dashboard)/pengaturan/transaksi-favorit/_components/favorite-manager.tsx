"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { ExternalLink, Plus, Trash2 } from "lucide-react"

import { createFavoriteTransaction, deleteFavoriteTransaction } from "@/actions/favorite.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { EmptyState } from "@/components/ui/empty-state"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/shadcn/input"
import { Label } from "@/components/ui/shadcn/label"

interface Favorite {
  id: number
  label: string
  href: string
}

interface Suggestion {
  href: string
  label: string
}

export function FavoriteManager({
  favorites,
  suggestions,
}: {
  favorites: Favorite[]
  suggestions: Suggestion[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [label, setLabel] = useState("")
  const [href, setHref] = useState("")

  function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData()
        formData.set("label", label)
        formData.set("href", href)
        const result = await createFavoriteTransaction(formData)
        if (result && !result.success) {
          showError(result.error || "Gagal menyimpan favorit")
          return
        }
        showSuccess("Transaksi favorit ditambahkan")
        setLabel("")
        setHref("")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan favorit")
      }
    })
  }

  function handleDelete(id: number) {
    startTransition(async () => {
      try {
        const result = await deleteFavoriteTransaction(id)
        if (result && !result.success) {
          showError(result.error || "Gagal menghapus favorit")
          return
        }
        showSuccess("Favorit dihapus")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menghapus favorit")
      }
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={handleAdd}
        className="bg-surface rounded-xl border border-default shadow-sm p-4 sm:p-5 flex flex-col gap-4"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="favorite-label">Nama Pintasan *</Label>
            <Input
              id="favorite-label"
              name="label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="mis. Faktur Penjualan Baru"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="favorite-href">Tautan *</Label>
            <Input
              id="favorite-href"
              name="href"
              value={href}
              onChange={(event) => setHref(event.target.value)}
              placeholder="/penjualan/faktur/tambah"
              list="favorite-href-suggestions"
              required
            />
            <datalist id="favorite-href-suggestions">
              {suggestions.map((suggestion) => (
                <option key={suggestion.href} value={suggestion.href}>
                  {suggestion.label}
                </option>
              ))}
            </datalist>
            <span className="text-xs text-muted-foreground">
              Tautan harus berupa jalur internal aplikasi (diawali “/”).
            </span>
          </div>
        </div>
        <div className="flex justify-end">
          <Button
            type="submit"
            variant="primary"
            size="sm"
            isDisabled={isPending}
            id="add-favorite-btn"
            className="gap-1.5"
          >
            <Plus size={16} aria-hidden="true" />
            {isPending ? "Menyimpan..." : "Tambah Favorit"}
          </Button>
        </div>
      </form>

      <div className="bg-surface rounded-xl border border-default shadow-sm divide-y divide-default">
        {favorites.length === 0 ? (
          <EmptyState title="Belum ada transaksi favorit" description="Tambahkan pintasan di atas agar transaksi yang sering dibuka bisa dijangkau cepat dari sini." className="py-5" />
        ) : (
          favorites.map((favorite) => (
            <div key={favorite.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
              <div className="min-w-0">
                <Link
                  href={favorite.href}
                  className="inline-flex items-center gap-1.5 font-medium text-foreground hover:underline"
                >
                  {favorite.label}
                  <ExternalLink size={14} aria-hidden="true" />
                </Link>
                <span className="block truncate text-xs text-muted-foreground font-mono">
                  {favorite.href}
                </span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                isDisabled={isPending}
                onPress={() => handleDelete(favorite.id)}
                aria-label={`Hapus favorit ${favorite.label}`}
                className="gap-1.5 text-danger"
              >
                <Trash2 size={16} aria-hidden="true" />
                Hapus
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
