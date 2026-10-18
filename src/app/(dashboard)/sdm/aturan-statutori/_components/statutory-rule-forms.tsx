"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Button } from "@/components/ui/button"
import { createStatutoryRule, closeStatutoryRule } from "@/actions/hrm.actions"

/** Form tambah baris aturan baru (perubahan tarif = baris baru). */
export function StatutoryRuleForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    startTransition(async () => {
      const res = await createStatutoryRule(new FormData(form))
      if (!res.success) {
        showError(res.error || "Gagal menyimpan aturan")
        return
      }
      showSuccess("Aturan ditambahkan")
      form.reset()
      router.refresh()
    })
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-3 p-4 px-5 border-b border-default sm:flex-row sm:items-end"
      aria-label="Tambah aturan statutori"
    >
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor="ruleKey">Kunci *</Label>
        <Input id="ruleKey" name="key" placeholder="bpjs_jp_ceiling" required maxLength={64} />
      </div>
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor="ruleValue">Nilai *</Label>
        <Input id="ruleValue" name="value" type="number" step="any" required />
      </div>
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor="ruleFrom">Berlaku Sejak *</Label>
        <Input id="ruleFrom" name="effectiveFrom" type="date" required />
      </div>
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor="ruleTo">Berlaku Sampai</Label>
        <Input id="ruleTo" name="effectiveTo" type="date" />
      </div>
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor="ruleSource">Sumber</Label>
        <Input id="ruleSource" name="source" placeholder="PP No. … / PMK …" maxLength={255} />
      </div>
      <Button type="submit" isDisabled={isPending}>
        {isPending ? "Menyimpan..." : "Tambah"}
      </Button>
    </form>
  )
}

/** Tutup baris aktif dengan tanggal akhir (tanpa menghapus histori). */
export function CloseRuleForm({ id }: { id: number }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    startTransition(async () => {
      const res = await closeStatutoryRule(id, new FormData(form))
      if (!res.success) {
        showError(res.error || "Gagal menutup aturan")
        return
      }
      showSuccess("Aturan ditutup")
      router.refresh()
    })
  }

  return (
    <form onSubmit={onSubmit} className="flex items-end gap-2" aria-label={`Tutup aturan ${id}`}>
      <Input name="effectiveTo" type="date" required aria-label="Tanggal tutup" className="w-36" />
      <Button type="submit" isDisabled={isPending} variant="secondary" size="sm">
        Tutup
      </Button>
    </form>
  )
}
