"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { AppDatePicker } from "@/components/ui/date-picker"
import { FormAttachmentUpload } from "@/components/ui/form-attachment-upload"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input, TextArea, Select, ComboBox, ListBox, Label } from "@heroui/react"
import { CurrencyInput } from "@/components/ui/currency-input"
import { FormCard, FormSection, FormActions } from "@/components/ui/form-section"
import { Button } from "@/components/ui/page-header"

export function PettyCashForm({ accounts, pettyCash, currentBalance }: { accounts: { id: number; code: string; name: string; type: string }[]; pettyCash?: { id: number; date: string; description?: string | null; amount: number; accountId: number; notes?: string | null; balanceBefore?: number; balanceAfter?: number }; currentBalance?: number }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [date, setDate] = useState(new Date().toISOString().split("T")[0])

  const assetAccounts = accounts.filter((a) => a.type === "ASSET")
  const expenseAccounts = accounts.filter((a) => a.type === "EXPENSE")
  const allAccounts = [...assetAccounts.map((a) => ({ ...a, group: "Kas/Bank" })), ...expenseAccounts.map((a) => ({ ...a, group: "Beban" }))]

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget)
        const { createPettyCash, updatePettyCash } = await import("@/actions/finance.actions")
        pettyCash?.id ? await updatePettyCash(pettyCash.id, formData) : await createPettyCash(formData)
        showSuccess(pettyCash?.id ? "Data berhasil diupdate" : "Data berhasil ditambahkan")
        router.push("/finance/petty-cash")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan data")
      }
    })
  }

  return (
    <form onSubmit={onSubmit}>
      <FormCard>
        <FormSection title="Informasi Umum">
          <div className="flex flex-col gap-1.5">
            <Select name="type" defaultSelectedKey="IN" className="w-full" isRequired>
              <Label>Tipe *</Label>
              <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
              <Select.Popover>
                <ListBox>
                  <ListBox.Item id="IN" textValue="Masuk (Pengisian)">Masuk (Pengisian)<ListBox.ItemIndicator /></ListBox.Item>
                  <ListBox.Item id="OUT" textValue="Keluar (Pengeluaran)">Keluar (Pengeluaran)<ListBox.ItemIndicator /></ListBox.Item>
                </ListBox>
              </Select.Popover>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <AppDatePicker
              label="Tanggal"
              name="date"
              value={date}
              onChange={(val) => setDate(val)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <ComboBox name="accountId" className="w-full">
              <Label>Akun Sumber (IN) / Beban (OUT)</Label>
              <ComboBox.InputGroup><Input placeholder="Cari akun..." /><ComboBox.Trigger /></ComboBox.InputGroup>
              <ComboBox.Popover>
                <ListBox>
                  {allAccounts.map((a) => (
                    <ListBox.Item key={a.id} id={String(a.id)} textValue={`${a.code} - ${a.name}`}>{a.group}: {a.code} - {a.name}</ListBox.Item>
                  ))}
                </ListBox>
              </ComboBox.Popover>
            </ComboBox>
          </div>
        </FormSection>
        <FormSection title="Keuangan">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="amount">Jumlah (Rp) *</Label>
            <CurrencyInput id="amount" name="amount" placeholder="0" required defaultValue={pettyCash?.amount} prefix="Rp" />
          </div>
        </FormSection>
        <FormSection title="Detail" columns={1}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Deskripsi</Label>
            <TextArea id="description" name="description" rows={3} placeholder="Deskripsi transaksi kas kecil..." defaultValue={pettyCash?.description ?? ""} />
          </div>
          <FormAttachmentUpload referenceType="petty_cash" />
        </FormSection>
        <FormSection title="Lainnya" columns={1}>
          <div className="p-4 bg-surface-secondary/50 rounded-lg border border-default">
            <p className="text-xs font-medium text-muted uppercase tracking-wide mb-2">Informasi Saldo</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-muted">Saldo Sebelum</span>
                <span className="text-sm font-medium text-foreground">Rp {(pettyCash?.balanceBefore ?? currentBalance ?? 0).toLocaleString("id-ID")}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-muted">Saldo Setelah</span>
                <span className="text-sm font-medium text-foreground">{pettyCash?.balanceAfter != null ? `Rp ${pettyCash.balanceAfter.toLocaleString("id-ID")}` : "Dihitung otomatis saat simpan"}</span>
              </div>
            </div>
          </div>
        </FormSection>
        <FormActions>
          <Button onPress={() => router.back()}>Batal</Button>
          <Button type="submit" variant="primary" isDisabled={isPending}>
            {isPending ? "Menyimpan..." : pettyCash?.id ? "Update" : "Simpan"}
          </Button>
        </FormActions>
      </FormCard>
    </form>
  )
}
