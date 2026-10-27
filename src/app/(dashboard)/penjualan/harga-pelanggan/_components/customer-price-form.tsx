"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import {
  createCustomerPriceList,
  updateCustomerPriceList,
} from "@/actions/customer-price-list.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Button } from "@/components/ui/button"
import { CurrencyInput } from "@/components/ui/currency-input"
import { Label } from "@/components/ui/shadcn/label"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { Combobox } from "@/components/ui/combobox"
import { AppDatePicker } from "@/components/ui/date-picker"

export interface PriceOption {
  value: string
  label: string
}

export interface ItemPriceOption extends PriceOption {
  unit: string
}

export interface CustomerPriceInitial {
  id: number
  customerCategoryId: string
  itemId: string
  price: string
  minQty: string
  effectiveDate: string
  expiresAt: string
  notes: string
}

export function CustomerPriceForm({
  categoryOptions,
  itemOptions,
  initial,
}: {
  categoryOptions: PriceOption[]
  itemOptions: ItemPriceOption[]
  initial?: CustomerPriceInitial
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [categoryId, setCategoryId] = useState(initial?.customerCategoryId ?? "")
  const [itemId, setItemId] = useState(initial?.itemId ?? "")
  const [price, setPrice] = useState<number | null>(initial?.price ? Number(initial.price) : null)
  const [minQty, setMinQty] = useState(initial?.minQty ?? "1")
  const [effectiveDate, setEffectiveDate] = useState(initial?.effectiveDate ?? "")
  const [expiresAt, setExpiresAt] = useState(initial?.expiresAt ?? "")
  const [notes, setNotes] = useState(initial?.notes ?? "")

  const isEdit = Boolean(initial)
  const selectedUnit = itemOptions.find((option) => option.value === itemId)?.unit
  const minQtyLabel = selectedUnit ? `Minimal Qty (${selectedUnit})` : "Minimal Qty"

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData()
        formData.set("customerCategoryId", categoryId)
        formData.set("itemId", itemId)
        formData.set("price", price === null ? "" : String(price))
        formData.set("minQty", minQty)
        formData.set("effectiveDate", effectiveDate)
        formData.set("expiresAt", expiresAt)
        formData.set("notes", notes)

        const result = initial
          ? await updateCustomerPriceList(initial.id, formData)
          : await createCustomerPriceList(formData)

        if (result && !result.success) {
          showError(result.error || "Gagal menyimpan daftar harga")
          return
        }
        showSuccess(isEdit ? "Daftar harga diperbarui" : "Daftar harga tersimpan")
        router.push("/penjualan/harga-pelanggan")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan daftar harga")
      }
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-label={isEdit ? "Formulir ubah daftar harga pelanggan" : "Formulir tambah daftar harga pelanggan"}
      aria-busy={isPending}
      className="flex flex-col gap-5 rounded-xl border border-default bg-surface p-6 shadow-sm"
    >
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="customerCategoryId">Kategori Pelanggan</Label>
          <Combobox
            id="customerCategoryId"
            options={categoryOptions}
            value={categoryId || null}
            onChange={(value) => setCategoryId(value ?? "")}
            placeholder="Umum (semua kategori)..."
          />
          <span className="text-xs text-muted-foreground">
            Kosongkan untuk harga umum yang berlaku bagi semua kategori pelanggan.
          </span>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="itemId">
            Barang <span className="text-destructive" aria-hidden="true">*</span>
          </Label>
          <Combobox
            id="itemId"
            options={itemOptions}
            value={itemId || null}
            onChange={(value) => setItemId(value ?? "")}
            placeholder="Pilih barang..."
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="price">
            Harga (Rp) <span className="text-destructive" aria-hidden="true">*</span>
          </Label>
          <CurrencyInput
            id="price"
            value={price}
            onChange={setPrice}
            placeholder="0"
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="minQty">
            {minQtyLabel} <span className="text-destructive" aria-hidden="true">*</span>
          </Label>
          <CurrencyInput
            id="minQty"
            value={minQty === "" ? null : Number(minQty)}
            onChange={(nilai) => setMinQty(String(nilai))}
            placeholder="1"
            required
          />
          <span className="text-xs text-muted-foreground">
            Harga berlaku untuk penjualan dengan jumlah minimal ini.
          </span>
        </div>

        <AppDatePicker
          label="Berlaku Sejak"
          name="effectiveDate"
          value={effectiveDate}
          onChange={setEffectiveDate}
        />

        <div className="flex flex-col gap-1.5">
          <AppDatePicker
            label="Berlaku Sampai"
            name="expiresAt"
            value={expiresAt}
            onChange={setExpiresAt}
          />
          <span className="text-xs text-muted-foreground">
            Opsional. Kosongkan bila harga tanpa batas waktu.
          </span>
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="notes">Catatan</Label>
          <Textarea
            id="notes"
            name="notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Catatan harga (opsional)"
            rows={2}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-default pt-5">
        <p className="text-xs text-muted-foreground">
          Harga terpilih otomatis dipakai faktur penjualan sesuai kategori, jumlah, dan tanggal.
        </p>
        <div className="flex gap-3">
          <Button type="button" onPress={() => router.back()} isDisabled={isPending}>
            Batal
          </Button>
          <Button type="submit" variant="primary" isDisabled={isPending} id="submit-customer-price">
            {isPending ? "Menyimpan..." : isEdit ? "Simpan Perubahan" : "Simpan"}
          </Button>
        </div>
      </div>
    </form>
  )
}
