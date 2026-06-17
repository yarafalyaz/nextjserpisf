"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { AppDatePicker } from "@/components/ui/date-picker"
import { FormAttachmentUpload } from "@/components/ui/form-attachment-upload"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { FormSelect } from "@/components/ui/form-select"
import { Combobox } from "@/components/ui/combobox"
import { CurrencyInput } from "@/components/ui/currency-input"
import { FormCard, FormSection, FormActions } from "@/components/ui/form-section"
import { Button } from "@/components/ui/button"

export function PettyCashForm({ accounts, pettyCash, currentBalance }: { accounts: { id: number; code: string; name: string; type: string }[]; pettyCash?: { id: number; date: string; type?: string; description?: string | null; amount: number; accountId: number; notes?: string | null; referenceNo?: string | null; balanceBefore?: number; balanceAfter?: number }; currentBalance?: number }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [date, setDate] = useState(pettyCash?.date ?? new Date().toISOString().split("T")[0])
  const [type, setType] = useState(pettyCash?.type ?? "IN")
  const [accountId, setAccountId] = useState<string | null>(pettyCash?.accountId ? String(pettyCash.accountId) : null)
  const assetAccounts = accounts.filter((a) => a.type === "ASSET")
  const expenseAccounts = accounts.filter((a) => a.type === "EXPENSE")
  const allAccounts = [...assetAccounts.map((a) => ({ ...a, group: "Kas/Bank" })), ...expenseAccounts.map((a) => ({ ...a, group: "Beban" }))]

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget)
        const { createPettyCash, updatePettyCash } = await import("@/actions/finance.actions")

        const result = pettyCash?.id ? await updatePettyCash(pettyCash.id, formData) : await createPettyCash(formData)
        if (result && !result.success) { showError(result.error || "Gagal menyimpan data"); return }

        showSuccess(pettyCash?.id ? "Data berhasil diperbarui" : "Data berhasil ditambahkan")
        router.push("/keuangan/kas-kecil")
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
            <Label htmlFor="type">Tipe *</Label>
            <FormSelect
              id="type"
              name="type"
              value={type}
              onValueChange={setType}
              options={[
                { value: "IN", label: "Masuk (Pengisian)" },
                { value: "OUT", label: "Keluar (Pengeluaran)" },
              ]}
            />
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
            <Label htmlFor="accountId">Akun Sumber (IN) / Beban (OUT)</Label>
            <Combobox
              id="accountId"
              name="accountId"
              options={allAccounts.map((a) => ({ value: String(a.id), label: `${a.group}: ${a.code} - ${a.name}` }))}
              value={accountId}
              onChange={setAccountId}
              placeholder="Cari akun..."
            />
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
            <Label htmlFor="referenceNo">No. Referensi</Label>
            <Input id="referenceNo" name="referenceNo" placeholder="No. referensi transaksi..." defaultValue={pettyCash?.referenceNo ?? ""} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Deskripsi</Label>
            <Textarea id="description" name="description" rows={3} placeholder="Deskripsi transaksi kas kecil..." defaultValue={pettyCash?.description ?? ""} />
          </div>
          <FormAttachmentUpload referenceType="petty_cash" />
        </FormSection>
        <FormSection title="Lainnya" columns={1}>
          <div className="p-4 bg-surface-secondary/50 rounded-lg border border-default">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Informasi Saldo</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-muted-foreground">Saldo Sebelum</span>
                <span className="text-sm font-medium text-foreground">Rp {(pettyCash?.balanceBefore ?? currentBalance ?? 0).toLocaleString("id-ID")}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-muted-foreground">Saldo Setelah</span>
                <span className="text-sm font-medium text-foreground">{pettyCash?.balanceAfter != null ? `Rp ${pettyCash.balanceAfter.toLocaleString("id-ID")}` : "Dihitung otomatis saat simpan"}</span>
              </div>
            </div>
          </div>
        </FormSection>
        <FormActions>
          <Button type="button" onPress={() => router.back()}>Batal</Button>
          <Button type="submit" variant="primary" isDisabled={isPending}>
            {isPending ? "Menyimpan..." : pettyCash?.id ? "Perbarui" : "Simpan"}
          </Button>
        </FormActions>
      </FormCard>
    </form>
  )
}
