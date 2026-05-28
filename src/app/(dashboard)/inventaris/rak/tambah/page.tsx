"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { createRack } from "@/actions/inventory.actions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { Input, Label } from "@heroui/react"
import { Button } from "@/components/ui/page-header"

export default function CreateRackPage() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      await createRack(formData)
      router.push("/inventaris/rak")
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Inventory", href: "/inventaris" },
  { label: "Racks", href: "/inventaris/rak" },
  { label: "Create" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tambah Rak</h1>
      </div>
      <form onSubmit={handleSubmit} className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="code">Kode Rak *</Label>
            <Input id="code" name="code" placeholder="Contoh: R-001" required />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Nama Rak *</Label>
            <Input id="name" name="name" placeholder="Nama rak" required />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="warehouseId">Warehouse ID *</Label>
            <Input id="warehouseId" name="warehouseId" type="number" placeholder="ID gudang" required />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
          <Button type="button" onPress={() => router.back()} >Batal</Button>
          <Button type="submit" variant="primary" isDisabled={isPending} id="submit-rack">
            {isPending ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
      </form>
    </div>
  )
}
