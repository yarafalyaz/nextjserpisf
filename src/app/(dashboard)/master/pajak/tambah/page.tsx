"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { createTax } from "@/actions/master.actions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { AppDatePicker } from "@/components/ui/date-picker"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { Checkbox } from "@/components/ui/shadcn/checkbox"
import { FormSelect } from "@/components/ui/form-select"
import { Button } from "@/components/ui/button"


export default function CreateTaxPage() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      await createTax(formData)
      router.push("/master/pajak")
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Data Master", href: "/master" },
  { label: "Pajak", href: "/master/pajak" },
  { label: "Buat" },
]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Tambah Pajak</h1>
      </div>
      <form onSubmit={handleSubmit} className="bg-surface rounded-xl border border-default shadow-sm p-4 sm:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tax-name">Nama Pajak</Label>
            <Input id="tax-name" name="name" placeholder="Contoh: PPN" required className="w-full" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tax-rate">Tarif (%)</Label>
            <Input id="tax-rate" name="rate" type="number" step="0.01" placeholder="Contoh: 11" required className="w-full" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tax-code">Kode</Label>
            <Input id="tax-code" name="code" placeholder="Contoh: PPN11" className="w-full" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tax-type">Tipe</Label>
            <FormSelect
              id="tax-type"
              name="type"
              placeholder="Pilih Tipe"
              options={[
                { value: "percentage", label: "Persentase" },
                { value: "fixed", label: "Nominal Tetap" },
              ]}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tax-scope">Lingkup</Label>
            <FormSelect
              id="tax-scope"
              name="scope"
              placeholder="Pilih Lingkup"
              options={[
                { value: "sales", label: "Penjualan" },
                { value: "purchase", label: "Pembelian" },
                { value: "both", label: "Keduanya" },
              ]}
            />
          </div>

          <AppDatePicker label="Berlaku Dari" name="effectiveFrom" className="w-full" />

          <AppDatePicker label="Berlaku Sampai" name="effectiveTo" className="w-full" />

          <div className="sm:col-span-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tax-description">Deskripsi</Label>
              <Textarea id="tax-description" name="description" placeholder="Deskripsi pajak (opsional)" className="w-full" />
            </div>
          </div>

          <div className="sm:col-span-2 flex flex-wrap gap-6">
            <div className="flex items-center gap-2">
              <Checkbox id="tax-is-inclusive" name="isInclusive" value="on" />
              <Label htmlFor="tax-is-inclusive">Termasuk Pajak</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="tax-is-compound" name="isCompound" value="on" />
              <Label htmlFor="tax-is-compound">Majemuk</Label>
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3 mt-6 pt-5 border-t border-default">
          <Button className="w-full sm:w-auto" type="button" onPress={() => router.back()} >Batal</Button>
          <Button className="w-full sm:w-auto" type="submit" variant="primary" isDisabled={isPending} id="submit-tax">
            {isPending ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
      </form>
    </div>
  )
}
