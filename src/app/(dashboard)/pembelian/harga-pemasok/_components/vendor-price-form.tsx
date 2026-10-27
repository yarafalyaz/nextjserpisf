"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import { createVendorPrice, updateVendorPrice } from "@/actions/vendor-price.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Button } from "@/components/ui/button"
import { CurrencyInput } from "@/components/ui/currency-input"
import { Label } from "@/components/ui/shadcn/label"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { Combobox } from "@/components/ui/combobox"
import { AppDatePicker } from "@/components/ui/date-picker"

export interface Option {
  value: string
  label: string
}

export interface VendorPriceInitial {
  id: number
  vendorId: string
  itemId: string
  price: string
  minQty: string
  effectiveDate: string
  notes: string
}

function RequiredMark() {
  return (
    <span className="text-destructive" aria-hidden="true">
      *
    </span>
  )
}

export function VendorPriceForm({
  vendorOptions,
  itemOptions,
  initial,
}: {
  vendorOptions: Option[]
  itemOptions: Option[]
  initial?: VendorPriceInitial
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [vendorId, setVendorId] = useState(initial?.vendorId ?? "")
  const [itemId, setItemId] = useState(initial?.itemId ?? "")
  const [price, setPrice] = useState<number | null>(initial?.price ? Number(initial.price) : null)
  const [minQty, setMinQty] = useState(initial?.minQty ?? "1")
  const [effectiveDate, setEffectiveDate] = useState(initial?.effectiveDate ?? "")
  const [notes, setNotes] = useState(initial?.notes ?? "")

  const isEdit = Boolean(initial)

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData()
        formData.set("vendorId", vendorId)
        formData.set("itemId", itemId)
        formData.set("price", price === null ? "" : String(price))
        formData.set("minQty", minQty)
        formData.set("effectiveDate", effectiveDate)
        formData.set("notes", notes)

        const result = initial
          ? await updateVendorPrice(initial.id, formData)
          : await createVendorPrice(formData)

        if (result && !result.success) {
          showError(result.error || "Gagal menyimpan harga pemasok")
          return
        }
        showSuccess(isEdit ? "Harga pemasok diperbarui" : "Harga pemasok tersimpan")
        router.push("/pembelian/harga-pemasok")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan harga pemasok")
      }
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-label={isEdit ? "Formulir ubah harga pemasok" : "Formulir tambah harga pemasok"}
      aria-busy={isPending}
      className="flex flex-col gap-5 rounded-xl border border-default bg-surface p-6 shadow-sm"
    >
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="vendorId">
            Pemasok <RequiredMark />
          </Label>
          <Combobox
            id="vendorId"
            required
            options={vendorOptions}
            value={vendorId || null}
            onChange={(value) => setVendorId(value ?? "")}
            placeholder="Pilih pemasok..."
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="itemId">
            Barang <RequiredMark />
          </Label>
          <Combobox
            id="itemId"
            required
            options={itemOptions}
            value={itemId || null}
            onChange={(value) => setItemId(value ?? "")}
            placeholder="Pilih barang..."
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="price">
            Harga <RequiredMark />
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
            Minimal Jml <RequiredMark />
          </Label>
          <CurrencyInput
            id="minQty"
            value={minQty === "" ? null : Number(minQty)}
            onChange={(nilai) => setMinQty(String(nilai))}
            placeholder="1"
            required
          />
          <input type="hidden" name="minQty" value={minQty} />
          <span className="text-xs text-muted-foreground">
            Harga berlaku untuk pembelian dengan jumlah minimal ini.
          </span>
        </div>

        <AppDatePicker
          label="Berlaku Sejak"
          name="effectiveDate"
          value={effectiveDate}
          onChange={setEffectiveDate}
        />

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
          Data rujukan — dokumen pembelian belum otomatis memakai harga ini.
        </p>
        <div className="flex gap-3">
          <Button type="button" onPress={() => router.back()} isDisabled={isPending}>
            Batal
          </Button>
          <Button type="submit" variant="primary" isDisabled={isPending} id="submit-vendor-price">
            {isPending ? "Menyimpan..." : isEdit ? "Simpan Perubahan" : "Simpan"}
          </Button>
        </div>
      </div>
    </form>
  )
}
