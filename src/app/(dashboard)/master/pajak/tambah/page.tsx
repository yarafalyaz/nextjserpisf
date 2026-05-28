"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { createTax } from "@/actions/master.actions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { AppDatePicker } from "@/components/ui/date-picker"
import { ListBox, Checkbox, Label, Select, Input, TextArea } from "@heroui/react"
import { Button } from "@/components/ui/page-header"

export default function CreateTaxPage() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
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
  { label: "Dashboard", href: "/" },
  { label: "Master Data", href: "/master" },
  { label: "Taxes", href: "/master/pajak" },
  { label: "Create" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tambah Pajak</h1>
      </div>
      <form onSubmit={handleSubmit} className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tax-name" isRequired>Nama Pajak</Label>
            <Input id="tax-name" name="name" placeholder="Contoh: PPN" required className="w-full" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tax-rate" isRequired>Rate (%)</Label>
            <Input id="tax-rate" name="rate" type="number" step="0.01" placeholder="Contoh: 11" required className="w-full" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tax-code">Kode</Label>
            <Input id="tax-code" name="code" placeholder="Contoh: PPN11" className="w-full" />
          </div>

          <Select name="type" className="w-full">
            <Label>Tipe</Label>
            <Select.Trigger><Select.Value>{({ selectedText }) => selectedText || "Pilih Tipe"}</Select.Value><Select.Indicator /></Select.Trigger>
            <Select.Popover>
              <ListBox>
                <ListBox.Item id="percentage" textValue="Percentage">Percentage<ListBox.ItemIndicator /></ListBox.Item>
                <ListBox.Item id="fixed" textValue="Fixed">Fixed<ListBox.ItemIndicator /></ListBox.Item>
              </ListBox>
            </Select.Popover>
          </Select>

          <Select name="scope" className="w-full">
            <Label>Lingkup</Label>
            <Select.Trigger><Select.Value>{({ selectedText }) => selectedText || "Pilih Lingkup"}</Select.Value><Select.Indicator /></Select.Trigger>
            <Select.Popover>
              <ListBox>
                <ListBox.Item id="sales" textValue="Penjualan">Penjualan<ListBox.ItemIndicator /></ListBox.Item>
                <ListBox.Item id="purchase" textValue="Pembelian">Pembelian<ListBox.ItemIndicator /></ListBox.Item>
                <ListBox.Item id="both" textValue="Both">Both<ListBox.ItemIndicator /></ListBox.Item>
              </ListBox>
            </Select.Popover>
          </Select>

          <AppDatePicker label="Berlaku Dari" name="effectiveFrom" className="w-full" />

          <AppDatePicker label="Berlaku Sampai" name="effectiveTo" className="w-full" />

          <div className="sm:col-span-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tax-description">Deskripsi</Label>
              <TextArea id="tax-description" name="description" placeholder="Deskripsi pajak (opsional)" className="w-full" />
            </div>
          </div>

          <div className="sm:col-span-2 flex flex-wrap gap-6">
            <Checkbox id="tax-is-inclusive" name="isInclusive" value="on">
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
              <Checkbox.Content>
                <Label htmlFor="tax-is-inclusive">Inclusive</Label>
              </Checkbox.Content>
            </Checkbox>
            <Checkbox id="tax-is-compound" name="isCompound" value="on">
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
              <Checkbox.Content>
                <Label htmlFor="tax-is-compound">Compound</Label>
              </Checkbox.Content>
            </Checkbox>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
          <Button type="button" onPress={() => router.back()} >Batal</Button>
          <Button type="submit" variant="primary" isDisabled={isPending} id="submit-tax">
            {isPending ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
      </form>
    </div>
  )
}
