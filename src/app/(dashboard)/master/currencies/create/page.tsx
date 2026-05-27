"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { createCurrency } from "@/actions/master.actions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { ListBox, Checkbox, Select, Label } from "@heroui/react"
import { Input, SelectValue } from "@/components/ui/heroui-compat"
import { Button } from "@/components/ui/page-header"

export default function CreateCurrencyPage() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      await createCurrency(formData)
      router.push("/master/currencies")
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Master Data", href: "/master" },
  { label: "Currencies", href: "/master/currencies" },
  { label: "Create" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tambah Mata Uang</h1>
      </div>
      <form onSubmit={handleSubmit} className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Input name="code" label="Kode *" placeholder="Contoh: USD" isRequired />

          <Input name="name" label="Nama *" placeholder="Contoh: US Dollar" isRequired />

          <Input name="rate" type="number" label="Rate *" placeholder="Contoh: 15800.0000" step="0.0001" isRequired />

          <Input name="symbol" label="Simbol" placeholder="e.g. Rp, $, €" />

          <Select name="symbolPosition" className="w-full">
            <Label>Posisi Simbol</Label>
            <Select.Trigger><SelectValue placeholder="Pilih posisi" /><Select.Indicator /></Select.Trigger>
            <Select.Popover>
              <ListBox>
                <ListBox.Item id="before" textValue="Before">Before<ListBox.ItemIndicator /></ListBox.Item>
                <ListBox.Item id="after" textValue="After">After<ListBox.ItemIndicator /></ListBox.Item>
              </ListBox>
            </Select.Popover>
          </Select>

          <Input name="decimalSeparator" label="Pemisah Desimal" placeholder="e.g. , or ." />

          <Input name="thousandsSeparator" label="Pemisah Ribuan" placeholder="e.g. . or ," />

          <Input name="decimalPlaces" type="number" label="Jumlah Desimal" placeholder="e.g. 2" />

          <div className="flex items-center sm:col-span-2">
            <Checkbox name="isBase">Mata Uang Dasar</Checkbox>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
          <Button onClick={() => router.back()} >Batal</Button>
          <Button type="submit" variant="primary" disabled={isPending} id="submit-currency">
            {isPending ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
      </form>
    </div>
  )
}
