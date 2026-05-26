"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { createBarcode } from "@/actions/master.actions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { Input, Select, ListBox, Label } from "@heroui/react"

export default function CreateBarcodePage() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      await createBarcode(formData)
      router.push("/master/barcodes")
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Master Data", href: "/master" },
  { label: "Barcodes", href: "/master/barcodes" },
  { label: "Create" },
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
            <Label htmlFor="itemId">Item ID *</Label>
            <Input id="itemId" name="itemId" type="number" placeholder="ID item" required />
          </div>

          <div className="flex flex-col gap-1.5">
            <Select name="type" defaultSelectedKey="EAN13" className="w-full">
              <Label htmlFor="type">Tipe</Label>
              <Select.Trigger><Select.Value>{({ selectedText }) => selectedText || "EAN13"}</Select.Value><Select.Indicator /></Select.Trigger>
              <Select.Popover>
                <ListBox>
                  <ListBox.Item key="EAN13" id="EAN13" textValue="EAN13">EAN13<ListBox.ItemIndicator /></ListBox.Item>
                  <ListBox.Item key="EAN8" id="EAN8" textValue="EAN8">EAN8<ListBox.ItemIndicator /></ListBox.Item>
                  <ListBox.Item key="UPC" id="UPC" textValue="UPC">UPC<ListBox.ItemIndicator /></ListBox.Item>
                  <ListBox.Item key="CODE128" id="CODE128" textValue="CODE128">CODE128<ListBox.ItemIndicator /></ListBox.Item>
                  <ListBox.Item key="CODE39" id="CODE39" textValue="CODE39">CODE39<ListBox.ItemIndicator /></ListBox.Item>
                  <ListBox.Item key="QR" id="QR" textValue="QR">QR<ListBox.ItemIndicator /></ListBox.Item>
                </ListBox>
              </Select.Popover>
            </Select>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
          <button type="button" onClick={() => router.back()} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all">Batal</button>
          <button type="submit" disabled={isPending} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="submit-barcode">
            {isPending ? "Menyimpan..." : "Simpan"}
          </button>
        </div>
      </form>
    </div>
  )
}
