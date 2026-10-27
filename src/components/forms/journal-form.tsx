"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { createJournal, updateJournal } from "@/actions/finance.actions"
import { AppDatePicker } from "@/components/ui/date-picker"
import { FormAttachmentUpload } from "@/components/ui/form-attachment-upload"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { CurrencyInput } from "@/components/ui/currency-input"
import { QuickAddSelect } from "@/components/ui/quick-add-select"
import { QUICK_ADD } from "@/lib/quick-add/registry"
import { Button } from "@/components/ui/button"
import { toLocalDateOnly } from "@/lib/utils/date-only"

interface JournalFormProps {
  accounts: { id: number; code: string; name: string }[]
  /** Master pusat laba; dipakai untuk mengisi entri jurnal (opsional). */
  profitCenters?: { id: number; code: string; name: string }[]
  costCenters?: { id: number; code: string; name: string }[]
  journal?: { id: number; date: string; description?: string | null; type?: string | null; entries?: Array<{ accountId: number; debit: number; credit: number; memo?: string; profitCenterId?: number | null; costCenterId?: number | null }> }
}

interface JournalEntry { accountId: number; debit: number; credit: number; memo: string; profitCenterId?: number; costCenterId?: number }

export function JournalForm({ accounts, profitCenters = [], costCenters = [], journal }: JournalFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [entries, setEntries] = useState<JournalEntry[]>(
    journal?.entries && journal.entries.length > 0
      ? journal.entries.map((e) => ({
          accountId: e.accountId,
          debit: e.debit,
          credit: e.credit,
          memo: e.memo ?? "",
        }))
      : [
          { accountId: 0, debit: 0, credit: 0, memo: "" },
          { accountId: 0, debit: 0, credit: 0, memo: "" },
        ],
  )
  const [description, setDescription] = useState(journal?.description ?? "")
  const [date, setDate] = useState(journal?.date ?? toLocalDateOnly(new Date()))
  const [accountOptions, setAccountOptions] = useState(accounts)
  // Pusat laba dipilih sekali per jurnal dan ditulis ke SETIAP entri. Tanpa ini
  // laporan pusat laba selalu menumpuk di "Tanpa Pusat Laba" walau masternya ada.
  const [profitCenterId, setProfitCenterId] = useState<string>(
    journal?.entries?.find((entry) => entry.profitCenterId)?.profitCenterId?.toString() ?? "",
  )
  // Pusat biaya: aksi jurnal SUDAH menulis `costCenterId` di kedua jalur sejak dulu,
  // tetapi form ini tidak pernah mengirimnya — jadi laporan pusat biaya melewatkan
  // seluruh jurnal manual. Sama persis dengan celah pusat laba sebelumnya.
  const [costCenterId, setCostCenterId] = useState<string>(
    journal?.entries?.find((entry) => entry.costCenterId)?.costCenterId?.toString() ?? "",
  )

  function addEntry() { setEntries([...entries, { accountId: 0, debit: 0, credit: 0, memo: "" }]) }
  function removeEntry(i: number) { setEntries(entries.filter((_, idx) => idx !== i)) }
  function updateEntry(i: number, field: keyof JournalEntry, value: string | number) {
    const updated = [...entries]; updated[i] = { ...updated[i], [field]: value }; setEntries(updated)
  }

  const totalDebit = entries.reduce((s, e) => s + e.debit, 0)
  const totalCredit = entries.reduce((s, e) => s + e.credit, 0)
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01

  function onSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!isBalanced) return showError("Debit dan Kredit harus seimbang!")
    startTransition(async () => {
      try {
        const formData = new FormData()
        formData.append("description", description)
        formData.append("transactionDate", date)
        formData.append(
          "entries",
          JSON.stringify(
            entries.map((entry) => ({
              ...entry,
              profitCenterId: profitCenterId ? Number(profitCenterId) : undefined,
              costCenterId: costCenterId ? Number(costCenterId) : undefined,
            })),
          ),
        )
        const nativeFormData = new FormData(e.currentTarget)
        const attachmentIdsValue = nativeFormData.get("attachmentIds")
        if (attachmentIdsValue) formData.append("attachmentIds", attachmentIdsValue as string)
        const result = journal?.id ? await updateJournal(journal.id, formData) : await createJournal(formData)
        if (result && !result.success) { showError(result.error || "Gagal menyimpan data"); return }
        showSuccess(journal?.id ? "Data berhasil diperbarui" : "Data berhasil ditambahkan")
        router.push("/keuangan/jurnal")
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
          <AppDatePicker
            label="Tanggal"
            name="transactionDate"
            value={date}
            onChange={(val) => setDate(val)}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="description">Deskripsi</Label>
          <Input id="description" type="text" value={description} onChange={(e) => setDescription(e.target.value)} className="w-full" placeholder="Deskripsi jurnal" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="profitCenterId">Pusat Laba</Label>
          <select
            id="profitCenterId"
            value={profitCenterId}
            onChange={(e) => setProfitCenterId(e.target.value)}
            className="h-9 w-full rounded-lg border border-default bg-surface px-3 text-sm text-foreground"
          >
            <option value="">-- Tanpa pusat laba --</option>
            {profitCenters.map((center) => (
              <option key={center.id} value={center.id}>
                {center.code} — {center.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="costCenterId">Pusat Biaya</Label>
          <select
            id="costCenterId"
            value={costCenterId}
            onChange={(e) => setCostCenterId(e.target.value)}
            className="h-9 w-full rounded-lg border border-default bg-surface px-3 text-sm text-foreground"
          >
            <option value="">-- Tanpa pusat biaya --</option>
            {costCenters.map((center) => (
              <option key={center.id} value={center.id}>
                {center.code} — {center.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ marginTop: "24px" }}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h3 style={{ margin: 0, fontSize: "1rem" }}>Entri</h3>
          <Button type="button" onPress={addEntry} variant="secondary" size="sm">+ Tambah Baris</Button>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ fontSize: "0.8125rem" }}>
          <thead><tr><th>Akun</th><th>Debit</th><th>Kredit</th><th>Memo</th><th></th></tr></thead>
          <tbody>
            {entries.map((entry, i) => (
              <tr key={i}>
                <td>
                  <QuickAddSelect
                    value={entry.accountId ? String(entry.accountId) : null}
                    onChange={(key) => updateEntry(i, "accountId", key ? Number(key) : 0)}
                    placeholder="Pilih Akun"
                    options={accountOptions.map((a) => ({ value: String(a.id), label: a.code ? `${a.code} - ${a.name}` : a.name }))}
                    title={QUICK_ADD.account.title}
                    fields={QUICK_ADD.account.fields}
                    action={QUICK_ADD.account.action}
                    onCreated={(created) => {
                      setAccountOptions((prev) => [...prev, { id: created.id, code: "", name: created.label }])
                      updateEntry(i, "accountId", created.id)
                    }}
                  />
                </td>
                <td><CurrencyInput value={entry.debit} onChange={(v) => updateEntry(i, "debit", v)} className="form-input" /></td>
                <td><CurrencyInput value={entry.credit} onChange={(v) => updateEntry(i, "credit", v)} className="form-input" /></td>
                <td><input type="text" value={entry.memo} onChange={(e) => updateEntry(i, "memo", e.target.value)} aria-label={`Memo baris ${i + 1}`} className="form-input" style={{ fontSize: "0.8125rem", padding: "6px" }} placeholder="Memo" /></td>
                <td>{entries.length > 2 && <Button type="button" onPress={() => removeEntry(i)} aria-label={`Hapus baris ${i + 1}`} variant="danger-soft" size="sm">×</Button>}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: "bold" }}>
              <td className="text-right">Total</td>
              <td className="text-right">Rp {totalDebit.toLocaleString("id-ID")}</td>
              <td className="text-right">Rp {totalCredit.toLocaleString("id-ID")}</td>
              <td><span className={isBalanced ? "text-success" : "text-danger"}>{isBalanced ? "Seimbang" : "Tidak Seimbang"}</span></td>
              <td></td>
            </tr>
          </tfoot>
        </table>
        </div>
      </div>

      <FormAttachmentUpload referenceType="journal" />
      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <Button type="button" onPress={() => router.back()} >Batal</Button>
        <Button type="submit" isDisabled={isPending || !isBalanced} >{isPending ? "Menyimpan..." : journal?.id ? "Perbarui" : "Simpan"}</Button>
      </div>
    </form>
  )
}
