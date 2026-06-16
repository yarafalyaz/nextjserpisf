"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { createAccount, updateAccount } from "@/actions/master.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { FormSelect } from "@/components/ui/form-select"
import { Combobox } from "@/components/ui/combobox"
import { Button } from "@/components/ui/button"

interface AccountFormProps {
  accounts: { id: number; code: string; name: string
}[]
  account?: { id: number; code: string; name: string; type: string; parentId?: number | null; description?: string | null }
  generatedCode?: string
}

export function AccountForm({ accounts, generatedCode, account }: AccountFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [parentId, setParentId] = useState(account?.parentId ? String(account.parentId) : "")

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget)
        const result = account?.id ? await updateAccount(account.id, formData) : await createAccount(formData)
        if (result.success) {
          showSuccess(account?.id ? "Data berhasil diperbarui" : "Data berhasil ditambahkan")
          router.push("/master/akun")
          router.refresh()
        } else {
          showError(result.error || "Gagal menyimpan data")
        }
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan data")
      }
    })
  }

  return (
    <form onSubmit={onSubmit} className="bg-surface rounded-xl border border-default shadow-sm p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="code">Kode Akun *</Label>
          <Input id="code" name="code" defaultValue={account?.code ?? generatedCode ?? ""} readOnly className="bg-muted" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Nama Akun *</Label>
          <Input id="name" name="name" placeholder="Kas" defaultValue={account?.name ?? ""} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="type">Tipe *</Label>
          <FormSelect
            id="type"
            name="type"
            required
            placeholder="Pilih Tipe"
            defaultValue={account?.type}
            options={[
              { value: "ASSET", label: "Aset" },
              { value: "LIABILITY", label: "Liabilitas" },
              { value: "EQUITY", label: "Ekuitas" },
              { value: "REVENUE", label: "Pendapatan" },
              { value: "EXPENSE", label: "Beban" },
            ]}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Akun Induk (Opsional)</Label>
          <Combobox
            name="parentId"
            value={parentId || null}
            onChange={(key) => setParentId(key ?? "")}
            placeholder="Cari akun..."
            options={accounts.map((a) => ({ value: String(a.id), label: `${a.code} - ${a.name}` }))}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="normalBalance">Saldo Normal</Label>
          <FormSelect
            id="normalBalance"
            name="normalBalance"
            placeholder="Pilih Saldo Normal"
            options={[
              { value: "DEBIT", label: "Debit" },
              { value: "CREDIT", label: "Kredit" },
            ]}
          />
        </div>
        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="description">Deskripsi</Label>
          <Textarea id="description" name="description" rows={2} placeholder="Deskripsi akun" defaultValue={account?.description ?? ""} />
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <Button type="button" onPress={() => router.back()} >Batal</Button>
        <Button type="submit" isDisabled={isPending}  id="submit-account">
          {isPending ? "Menyimpan..." : account?.id ? "Perbarui" : "Simpan"}
        </Button>
      </div>
    </form>
  )
}
