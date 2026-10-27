"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { createBankStatementLine, updateBankStatementLine } from "@/actions/finance.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/shadcn/input"
import { Label } from "@/components/ui/shadcn/label"
import { CurrencyInput } from "@/components/ui/currency-input"
import { AppDatePicker } from "@/components/ui/date-picker"
import { BANK_STATEMENT_LINE_TYPE_LABELS } from "./bank-statement-line-labels"

// Formulir baris rekening koran: satu-satunya UI yang memanggil
// createBankStatementLine/updateBankStatementLine. Sebelum ini model
// `BankStatementLine` tidak punya jalur tulis sama sekali — hanya skrip seed yang
// pernah mengisinya — sehingga halaman detail rekening koran selalu kosong dan
// `totalDebits`/`totalCredits` header tetap 0.
//
// Field FormData yang dikirim: bankStatementId (string angka, dari input tersembunyi),
// date (YYYY-MM-DD — hari kalender WIB), description (opsional), amount (nominal
// mutasi, selalu positif; input memakai CurrencyInput sehingga angkanya tampil
// dengan pemisah ribuan id-ID), type ("debit" | "credit"), reference (opsional).
//
// `date` sengaja dikirim sebagai string `YYYY-MM-DD`, bukan nilai `Date`: aksinya
// mengonversinya lewat `wibDateToUtcMidnight`, sedangkan `new Date("YYYY-MM-DD")`
// bergantung pada zona waktu proses. Karena itu pula nilai awalnya diambil dari
// komponen UTC tanggal tersimpan (lihat `dateInputValue` di halaman).

export type BankStatementLineItem = {
  id: number
  /** `YYYY-MM-DD` hari kalender WIB (nilai untuk `AppDatePicker`). */
  date: string
  description: string
  /** Besar mutasi, selalu positif; `type` yang menentukan kolomnya. */
  amount: number
  type: string
  reference: string
}

export function BankStatementLineForm({
  bankStatementId,
  baseHref,
  line,
}: {
  bankStatementId: number
  /** Href halaman ini tanpa parameter ubah — dipakai tombol Batal & setelah simpan. */
  baseHref: string
  line?: BankStatementLineItem
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  // Nilai nominal dipegang sebagai state supaya bisa direset setelah baris
  // ditambahkan; `CurrencyInput` menyimpan tampilannya di state internal, dan
  // `form.reset()` saja tidak mengosongkan angka yang terlihat.
  const [amount, setAmount] = useState<number>(line?.amount ?? 0)

  function onSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    startTransition(async () => {
      const fd = new FormData(form)
      const res = line
        ? await updateBankStatementLine(line.id, fd)
        : await createBankStatementLine(fd)
      if (!res.success) {
        showError(res.error || "Gagal menyimpan baris rekening koran")
        return
      }
      showSuccess(
        line ? "Baris rekening koran diperbarui" : "Baris rekening koran ditambahkan",
      )
      if (line) {
        // Kembali ke mode tambah: parameter `?editBaris=` dilepas, dan `key` pada
        // form berubah sehingga form di-mount ulang (tidak menyimpan sisa isian).
        router.push(baseHref)
      } else {
        form.reset()
        setAmount(0)
      }
      router.refresh()
    })
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-5"
      aria-label={line ? "Ubah baris rekening koran" : "Tambah baris rekening koran"}
    >
      <Input type="hidden" name="bankStatementId" value={bankStatementId} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <AppDatePicker
          label="Tanggal *"
          name="date"
          required
          defaultValue={line?.date ?? ""}
          className="sm:w-40"
        />
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="lineDescription">Deskripsi</Label>
          <Input
            id="lineDescription"
            name="description"
            placeholder="mis. Transfer masuk dari pelanggan"
            defaultValue={line?.description ?? ""}
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:w-44">
          <Label htmlFor="lineAmount">Nominal *</Label>
          <CurrencyInput
            id="lineAmount"
            name="amount"
            required
            value={amount}
            onChange={setAmount}
          />
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-col gap-1.5 sm:w-40">
          <Label htmlFor="lineType">Arah Mutasi *</Label>
          <select
            id="lineType"
            name="type"
            required
            defaultValue={line?.type ?? "debit"}
            className="h-9 rounded-lg border border-default bg-surface px-3 text-sm text-foreground"
          >
            {Object.entries(BANK_STATEMENT_LINE_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="lineReference">Referensi</Label>
          <Input
            id="lineReference"
            name="reference"
            placeholder="mis. nomor cek/transfer"
            defaultValue={line?.reference ?? ""}
          />
        </div>
        <div className="flex gap-2">
          <Button type="submit" variant="primary" isDisabled={isPending}>
            {isPending ? "Menyimpan..." : line ? "Perbarui" : "Tambah"}
          </Button>
          {line && (
            <Button type="button" onPress={() => router.push(baseHref)}>
              Batal
            </Button>
          )}
        </div>
      </div>
    </form>
  )
}
