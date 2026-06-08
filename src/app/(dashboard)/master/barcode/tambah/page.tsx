"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { createBarcode } from "@/actions/master.actions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { Input } from "@/components/ui/shadcn/input"
import { Label } from "@/components/ui/shadcn/label"
import { FormSelect } from "@/components/ui/form-select"
import { Button } from "@/components/ui/page-header"

export default function CreateBarcodePage() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      await createBarcode(formData)
      router.push("/master/barcode")
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Master Data", href: "/master" },
  { label: "Barcode", href: "/master/barcode" },
  { label: "Buat" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tambah Barcode</h1>
      </div>
      <form onSubmit={handleSubmit} className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="barcode">Barcode *</Label>
            <Input id="barcode" name="barcode" placeholder="Kode barcode" required />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="itemId">ID Barang *</Label>
            <Input id="itemId" name="itemId" type="number" placeholder="ID barang" required />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="type">Tipe</Label>
            <FormSelect
              id="type"
              name="type"
              defaultValue="EAN13"
              options={[
                { value: "EAN13", label: "EAN13" },
                { value: "EAN8", label: "EAN8" },
                { value: "UPC", label: "UPC" },
                { value: "CODE128", label: "CODE128" },
                { value: "CODE39", label: "CODE39" },
                { value: "QR", label: "QR" },
              ]}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
          <Button type="button" onPress={() => router.back()} >Batal</Button>
          <Button type="submit" variant="primary" isDisabled={isPending} id="submit-barcode">
            {isPending ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
      </form>
    </div>
  )
}
