"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { createTax } from "@/actions/master.actions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { AppDatePicker } from "@/components/ui/date-picker"
import { ListBox, Checkbox, Select as HeroSelect } from "@heroui/react"
import { Input, TextArea, SelectValue, SelectLabel } from "@/components/ui/heroui-compat"

export default function CreateTaxPage() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      await createTax(formData)
      router.push("/master/taxes")
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Master Data", href: "/master" },
  { label: "Taxes", href: "/master/taxes" },
  { label: "Create" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tambah Pajak</h1>
      </div>
      <form onSubmit={handleSubmit} className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Input label="Nama Pajak *" name="name" placeholder="Contoh: PPN" isRequired className="w-full" />

          <Input label="Rate (%) *" name="rate" type="number" step="0.01" placeholder="Contoh: 11" isRequired className="w-full" />

          <Input label="Kode" name="code" placeholder="Contoh: PPN11" className="w-full" />

          <HeroSelect name="type" className="w-full">
            <SelectLabel>Tipe</SelectLabel>
            <HeroSelect.Trigger><SelectValue placeholder="Pilih Tipe" /><HeroSelect.Indicator /></HeroSelect.Trigger>
            <HeroSelect.Popover>
              <ListBox>
                <ListBox.Item id="percentage" textValue="Percentage">Percentage<ListBox.ItemIndicator /></ListBox.Item>
                <ListBox.Item id="fixed" textValue="Fixed">Fixed<ListBox.ItemIndicator /></ListBox.Item>
              </ListBox>
            </HeroSelect.Popover>
          </HeroSelect>

          <HeroSelect name="scope" className="w-full">
            <SelectLabel>Lingkup</SelectLabel>
            <HeroSelect.Trigger><SelectValue placeholder="Pilih Lingkup" /><HeroSelect.Indicator /></HeroSelect.Trigger>
            <HeroSelect.Popover>
              <ListBox>
                <ListBox.Item id="sales" textValue="Sales">Sales<ListBox.ItemIndicator /></ListBox.Item>
                <ListBox.Item id="purchase" textValue="Purchase">Purchase<ListBox.ItemIndicator /></ListBox.Item>
                <ListBox.Item id="both" textValue="Both">Both<ListBox.ItemIndicator /></ListBox.Item>
              </ListBox>
            </HeroSelect.Popover>
          </HeroSelect>

          <AppDatePicker label="Berlaku Dari" name="effectiveFrom" className="w-full" />

          <AppDatePicker label="Berlaku Sampai" name="effectiveTo" className="w-full" />

          <div className="sm:col-span-2">
            <TextArea label="Deskripsi" name="description" placeholder="Deskripsi pajak (opsional)" className="w-full" />
          </div>

          <div className="sm:col-span-2 flex flex-wrap gap-6">
            <Checkbox name="isInclusive">Inclusive</Checkbox>
            <Checkbox name="isCompound">Compound</Checkbox>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
          <button type="button" onClick={() => router.back()} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all">Batal</button>
          <button type="submit" disabled={isPending} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="submit-tax">
            {isPending ? "Menyimpan..." : "Simpan"}
          </button>
        </div>
      </form>
    </div>
  )
}
