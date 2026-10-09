"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { createAllocationRule } from "@/actions/allocation.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input } from "@/components/ui/shadcn/input"
import { Label } from "@/components/ui/shadcn/label"
import { Button } from "@/components/ui/button"
import { Combobox } from "@/components/ui/combobox"
import { QuickAddSelect } from "@/components/ui/quick-add-select"
import { QUICK_ADD } from "@/lib/quick-add/registry"

interface Props {
  skfs: { id: number; code: string | null; name: string; unit: string }[]
  accounts: { id: number; code: string; name: string }[]
  costCenters: { id: number; code: string; name: string }[]
}

export function AllocationRuleForm({ skfs, accounts, costCenters }: Props) {
  const router = useRouter()
  const [isPending, setIsPending] = useState(false)
  const [sourceAccountId, setSourceAccountId] = useState("")
  const [accountOptions, setAccountOptions] = useState(accounts)
  const [skfId, setSkfId] = useState("")
  const [targetIds, setTargetIds] = useState<number[]>([])

  function toggleTarget(id: number) {
    setTargetIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setIsPending(true)
    const fd = new FormData(e.currentTarget)
    for (const id of targetIds) fd.append("targetIds[]", String(id))
    const res = await createAllocationRule(fd)
    if (res.success) {
      showSuccess("Aturan alokasi berhasil dibuat")
      router.push("/anggaran/alokasi-skf")
      router.refresh()
    } else {
      showError(res.error || "Gagal menyimpan")
    }
    setIsPending(false)
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface rounded-xl border border-default shadow-sm p-6 space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Nama Aturan *</Label>
          <Input id="name" name="name" required placeholder="Alokasi Biaya Listrik" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Akun Sumber *</Label>
          <QuickAddSelect
            options={accountOptions.map((a) => ({ value: String(a.id), label: `${a.code} — ${a.name}` }))}
            value={sourceAccountId}
            onChange={(v) => setSourceAccountId(v ?? "")}
            placeholder="Pilih akun..."
            title={QUICK_ADD.account.title}
            fields={QUICK_ADD.account.fields}
            action={QUICK_ADD.account.action}
            onCreated={(created) => {
              setAccountOptions((prev) => [...prev, { id: created.id, code: "", name: created.label }])
              setSourceAccountId(String(created.id))
            }}
          />
          <input type="hidden" name="sourceAccountId" value={sourceAccountId} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Key Figure *</Label>
          <Combobox
            options={skfs.map((s) => ({ value: String(s.id), label: `${s.code ? s.code + " — " : ""}${s.name} (${s.unit})` }))}
            value={skfId}
            onChange={(v) => setSkfId(v ?? "")}
            placeholder="Pilih key figure..."
          />
          <input type="hidden" name="skfId" value={skfId} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="description">Deskripsi</Label>
          <Input id="description" name="description" placeholder="Opsional" />
        </div>
      </div>

      <div className="border-t border-default pt-4">
        <Label className="mb-2 block">Target Pusat Biaya (kosongkan untuk semua)</Label>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-60 overflow-y-auto p-2 border border-default rounded-lg">
          {costCenters.map((cc) => (
            <label key={cc.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted p-1.5 rounded">
              <input
                type="checkbox"
                checked={targetIds.includes(cc.id)}
                onChange={() => toggleTarget(cc.id)}
                className="size-4"
              />
              {cc.code} — {cc.name}
            </label>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-default">
        <Button type="button" variant="outline" onPress={() => router.back()}>Batal</Button>
        <Button type="submit" variant="primary" isDisabled={isPending}>
          {isPending ? "Menyimpan..." : "Simpan"}
        </Button>
      </div>
    </form>
  )
}
