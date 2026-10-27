"use client"

import { useRouter } from "next/navigation"
import { useRef, useState, useTransition } from "react"
import { ArrowRight } from "lucide-react"

import { createBankTransfer } from "@/actions/bank-transfer.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Button } from "@/components/ui/button"
import { CurrencyInput } from "@/components/ui/currency-input"
import { Label } from "@/components/ui/shadcn/label"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { Combobox } from "@/components/ui/combobox"
import { AppDatePicker } from "@/components/ui/date-picker"
import { toLocalDateOnly } from "@/lib/utils/date-only"

export interface TransferAccountOption {
  id: number
  code: string
  name: string
}

export function BankTransferForm({
  accounts,
  expenseAccounts,
}: {
  accounts: TransferAccountOption[]
  expenseAccounts: TransferAccountOption[]
}) {
  const router = useRouter()
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID())
  const [isPending, startTransition] = useTransition()

  const [date, setDate] = useState(toLocalDateOnly(new Date()))
  const [fromAccountId, setFromAccountId] = useState("")
  const [toAccountId, setToAccountId] = useState("")
  const [amount, setAmount] = useState<number | null>(null)
  const [adminFee, setAdminFee] = useState<number | null>(null)
  const [feeAccountId, setFeeAccountId] = useState("")
  const [description, setDescription] = useState("")

  const accountOptions = accounts.map((account) => ({
    value: String(account.id),
    label: `${account.code} - ${account.name}`,
  }))
  const expenseOptions = expenseAccounts.map((account) => ({
    value: String(account.id),
    label: `${account.code} - ${account.name}`,
  }))

  const feeNumber = adminFee ?? 0

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData()
        formData.set("idempotencyKey", idempotencyKeyRef.current)
        formData.set("date", date)
        formData.set("fromAccountId", fromAccountId)
        formData.set("toAccountId", toAccountId)
        formData.set("amount", amount === null ? "" : String(amount))
        formData.set("adminFee", adminFee === null ? "0" : String(adminFee))
        formData.set("feeAccountId", feeAccountId)
        formData.set("description", description)

        const result = await createBankTransfer(formData)
        if (result && !result.success) {
          showError(result.error || "Gagal menyimpan transfer")
          return
        }
        idempotencyKeyRef.current = crypto.randomUUID()
        showSuccess("Transfer berhasil disimpan dan jurnalnya diposting")
        router.push("/keuangan/transfer-bank")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan transfer")
      }
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-surface rounded-xl border border-default shadow-sm p-4 sm:p-6 flex flex-col gap-5"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <AppDatePicker label="Tanggal Transfer *" name="date" value={date} onChange={setDate} required />

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="amount">Nominal Transfer *</Label>
          <CurrencyInput
            id="amount"
            value={amount}
            onChange={setAmount}
            placeholder="0"
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fromAccountId">Dari Rekening *</Label>
          <Combobox
            id="fromAccountId"
            options={accountOptions}
            value={fromAccountId || null}
            onChange={(value) => setFromAccountId(value ?? "")}
            placeholder="Pilih rekening asal..."
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="toAccountId">Ke Rekening *</Label>
          <Combobox
            id="toAccountId"
            options={accountOptions}
            value={toAccountId || null}
            onChange={(value) => setToAccountId(value ?? "")}
            placeholder="Pilih rekening tujuan..."
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="adminFee">Biaya Admin</Label>
          <CurrencyInput
            id="adminFee"
            value={adminFee}
            onChange={setAdminFee}
            placeholder="0"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="feeAccountId">Akun Biaya Admin {feeNumber > 0 ? "*" : ""}</Label>
          <Combobox
            id="feeAccountId"
            options={expenseOptions}
            value={feeAccountId || null}
            onChange={(value) => setFeeAccountId(value ?? "")}
            placeholder={feeNumber > 0 ? "Wajib dipilih..." : "Opsional"}
          />
          <span className="text-xs text-muted-foreground">
            Dipakai bila biaya admin lebih dari 0 — biaya mengurangi rekening asal, bukan nominal
            transfer.
          </span>
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="description">Keterangan</Label>
          <Textarea
            id="description"
            name="description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Keterangan transfer (opsional)"
            rows={2}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-5 border-t border-default">
        <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
          Jurnal: Dr {toAccountId ? "rekening tujuan" : "…"} <ArrowRight size={12} aria-hidden="true" /> Cr
          {" "}rekening asal{feeNumber > 0 ? " + biaya admin" : ""}
        </p>
        <div className="flex gap-3">
          <Button type="button" onPress={() => router.back()} isDisabled={isPending}>
            Batal
          </Button>
          <Button type="submit" variant="primary" isDisabled={isPending} id="submit-bank-transfer">
            {isPending ? "Menyimpan..." : "Simpan & Posting"}
          </Button>
        </div>
      </div>
    </form>
  )
}
