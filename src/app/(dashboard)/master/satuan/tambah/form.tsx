"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input, Label } from "@heroui/react"
import { Button } from "@/components/ui/page-header"

export function UomForm({ uom }: { uom?: any } = {}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget)
        const res = await fetch("/api/master/uom", {
          method: uom?.id ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: uom?.id,
            name: formData.get("name"),
            symbol: formData.get("symbol"),
          }),
        })
        if (!res.ok) throw new Error("Gagal menyimpan")
        showSuccess(uom?.id ? "Data berhasil diupdate" : "Data berhasil ditambahkan")
        router.push("/master/satuan")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan data")
      }
    })
  }

  return (
    <form onSubmit={onSubmit} className="bg-surface rounded-xl border border-default shadow-sm p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Nama Satuan *</Label>
          <Input id="name" name="name" required placeholder="Contoh: Kilogram" defaultValue={uom?.name || ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="symbol">Simbol *</Label>
          <Input id="symbol" name="symbol" required placeholder="Contoh: kg" defaultValue={uom?.symbol || ""} />
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <Button onPress={() => router.back()} >Batal</Button>
        <Button type="submit" variant="primary" isDisabled={isPending}>{isPending ? "Menyimpan..." : uom?.id ? "Update" : "Simpan"}</Button>
      </div>
    </form>
  )
}
