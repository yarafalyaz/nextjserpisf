"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { createAccount, updateAccount } from "@/actions/master.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { ComboBox, ListBox, Label, Select, Input, TextArea } from "@heroui/react"
import { Button } from "@/components/ui/page-header"

interface AccountFormProps {
  accounts: { id: number; code: string; name: string
}[]
  account?: { id: number; code: string; name: string; type: string; parentId?: number | null; description?: string | null }
  generatedCode?: string
}

export function AccountForm({ accounts, generatedCode, account }: AccountFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const isEdit = false

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget)
        const result = account?.id ? await updateAccount(account.id, formData) : await createAccount(formData)
        if (result.success) {
          showSuccess(account?.id ? "Data berhasil diupdate" : "Data berhasil ditambahkan")
          router.push("/master/accounts")
          router.refresh()
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
          <Input id="code" name="code" defaultValue={generatedCode || ""} readOnly className="bg-muted" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Nama Akun *</Label>
          <Input id="name" name="name" placeholder="Kas" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Select name="type" className="w-full" isRequired>
            <Label>Tipe *</Label>
            <Select.Trigger><Select.Value>{({ selectedText }) => selectedText || "Pilih Tipe"}</Select.Value><Select.Indicator /></Select.Trigger>
            <Select.Popover>
              <ListBox>
                <ListBox.Item id="ASSET" textValue="ASSET">ASSET<ListBox.ItemIndicator /></ListBox.Item>
                <ListBox.Item id="LIABILITY" textValue="LIABILITY">LIABILITY<ListBox.ItemIndicator /></ListBox.Item>
                <ListBox.Item id="EQUITY" textValue="EQUITY">EQUITY<ListBox.ItemIndicator /></ListBox.Item>
                <ListBox.Item id="REVENUE" textValue="REVENUE">REVENUE<ListBox.ItemIndicator /></ListBox.Item>
                <ListBox.Item id="EXPENSE" textValue="EXPENSE">EXPENSE<ListBox.ItemIndicator /></ListBox.Item>
              </ListBox>
            </Select.Popover>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <ComboBox name="parentId" className="w-full">
            <Label>Parent Akun (Opsional)</Label>
            <ComboBox.InputGroup><Input placeholder="Cari akun..." /><ComboBox.Trigger /></ComboBox.InputGroup>
            <ComboBox.Popover>
              <ListBox>
                {accounts.map((a) => (
                  <ListBox.Item key={a.id} id={String(a.id)} textValue={`${a.code} - ${a.name}`}>{a.code} - {a.name}</ListBox.Item>
                ))}
              </ListBox>
            </ComboBox.Popover>
          </ComboBox>
        </div>
        <div className="flex flex-col gap-1.5">
          <Select name="normalBalance" className="w-full">
            <Label>Saldo Normal</Label>
            <Select.Trigger><Select.Value>{({ selectedText }) => selectedText || "Pilih Saldo Normal"}</Select.Value><Select.Indicator /></Select.Trigger>
            <Select.Popover>
              <ListBox>
                <ListBox.Item id="DEBIT" textValue="DEBIT">DEBIT<ListBox.ItemIndicator /></ListBox.Item>
                <ListBox.Item id="CREDIT" textValue="CREDIT">CREDIT<ListBox.ItemIndicator /></ListBox.Item>
              </ListBox>
            </Select.Popover>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="description">Deskripsi</Label>
          <TextArea id="description" name="description" rows={2} placeholder="Deskripsi akun" defaultValue={account?.description ?? ""} />
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <Button onPress={() => router.back()} >Batal</Button>
        <Button isDisabled={isPending}  id="submit-account">
          {isPending ? "Menyimpan..." : account?.id ? "Update" : "Simpan"}
        </Button>
      </div>
    </form>
  )
}
