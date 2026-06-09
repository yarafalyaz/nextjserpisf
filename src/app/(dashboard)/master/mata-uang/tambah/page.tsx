"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { createCurrency } from "@/actions/master.actions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Checkbox } from "@/components/ui/shadcn/checkbox"
import { FormSelect } from "@/components/ui/form-select"
import { Button } from "@/components/ui/page-header"


export default function CreateCurrencyPage() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      await createCurrency(formData)
      router.push("/master/mata-uang")
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Master Data", href: "/master" },
  { label: "Mata Uang", href: "/master/mata-uang" },
  { label: "Buat" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tambah Mata Uang</h1>
      </div>
      <form onSubmit={handleSubmit} className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="currency-code">Kode</Label>
            <Input id="currency-code" name="code" placeholder="Contoh: USD" required />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="currency-name">Nama</Label>
            <Input id="currency-name" name="name" placeholder="Contoh: US Dollar" required />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="currency-rate">Rate</Label>
            <Input id="currency-rate" name="rate" type="number" placeholder="Contoh: 15800.0000" step="0.0001" required />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="currency-symbol">Simbol</Label>
            <Input id="currency-symbol" name="symbol" placeholder="e.g. Rp, $, €" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="currency-symbol-position">Posisi Simbol</Label>
            <FormSelect
              id="currency-symbol-position"
              name="symbolPosition"
              placeholder="Pilih posisi"
              options={[
                { value: "before", label: "Sebelum" },
                { value: "after", label: "Sesudah" },
              ]}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="currency-decimal-separator">Pemisah Desimal</Label>
            <Input id="currency-decimal-separator" name="decimalSeparator" placeholder="e.g. , or ." />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="currency-thousands-separator">Pemisah Ribuan</Label>
            <Input id="currency-thousands-separator" name="thousandsSeparator" placeholder="e.g. . or ," />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="currency-decimal-places">Jumlah Desimal</Label>
            <Input id="currency-decimal-places" name="decimalPlaces" type="number" placeholder="e.g. 2" />
          </div>

          <div className="flex items-center gap-2 sm:col-span-2">
            <Checkbox id="currency-is-base" name="isBase" value="on" />
            <Label htmlFor="currency-is-base">Mata Uang Dasar</Label>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
          <Button type="button" onPress={() => router.back()} >Batal</Button>
          <Button type="submit" variant="primary" isDisabled={isPending} id="submit-currency">
            {isPending ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
      </form>
    </div>
  )
}
