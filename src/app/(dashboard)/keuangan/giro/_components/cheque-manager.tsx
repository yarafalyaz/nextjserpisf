"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { BadgeCheck, Ban, Trash2 } from "lucide-react"

import { createCheque, deleteCheque, updateChequeStatus } from "@/actions/cheque.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Button } from "@/components/ui/button"
import { CurrencyInput } from "@/components/ui/currency-input"
import { Input } from "@/components/ui/shadcn/input"
import { Label } from "@/components/ui/shadcn/label"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { Combobox } from "@/components/ui/combobox"
import { FormSelect } from "@/components/ui/form-select"
import { AppDatePicker } from "@/components/ui/date-picker"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { EmptyState } from "@/components/ui/empty-state"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { formatAccounting } from "@/lib/utils/format"

export interface ChequeRow {
  id: number
  documentNo: string
  type: string
  direction: string
  number: string | null
  party: string | null
  accountLabel: string | null
  amount: number
  dueDate: string
  status: string
}

interface AccountOption {
  id: number
  code: string
  name: string
}

const TYPE_LABEL: Record<string, string> = {
  giro: "Giro",
  cek: "Cek",
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Belum Cair",
  cleared: "Sudah Cair",
  cancelled: "Dibatalkan",
}

export function ChequeManager({
  cheques,
  accounts,
}: {
  cheques: ChequeRow[]
  accounts: AccountOption[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [type, setType] = useState("giro")
  const [direction, setDirection] = useState("in")
  const [number, setNumber] = useState("")
  const [party, setParty] = useState("")
  const [accountId, setAccountId] = useState("")
  const [amount, setAmount] = useState<number | null>(null)
  const [dueDate, setDueDate] = useState(toLocalDateOnly(new Date()))
  const [notes, setNotes] = useState("")

  const accountOptions = accounts.map((account) => ({
    value: String(account.id),
    label: `${account.code} - ${account.name}`,
  }))

  function handleCreate(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData()
        formData.set("type", type)
        formData.set("direction", direction)
        formData.set("number", number)
        formData.set("party", party)
        formData.set("accountId", accountId)
        formData.set("amount", amount === null ? "" : String(amount))
        formData.set("dueDate", dueDate)
        formData.set("notes", notes)

        const result = await createCheque(formData)
        if (result && !result.success) {
          showError(result.error || "Gagal menyimpan giro/cek")
          return
        }
        showSuccess("Giro/cek dicatat")
        setNumber("")
        setParty("")
        setAmount(null)
        setNotes("")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan giro/cek")
      }
    })
  }

  function handleStatus(id: number, status: string) {
    startTransition(async () => {
      try {
        const result = await updateChequeStatus(id, status)
        if (result && !result.success) {
          showError(result.error || "Gagal mengubah status")
          return
        }
        showSuccess("Status diperbarui")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal mengubah status")
      }
    })
  }

  function handleDelete(id: number) {
    startTransition(async () => {
      try {
        const result = await deleteCheque(id)
        if (result && !result.success) {
          showError(result.error || "Gagal menghapus")
          return
        }
        showSuccess("Giro/cek dihapus")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menghapus")
      }
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={handleCreate}
        className="bg-surface rounded-xl border border-default shadow-sm p-4 sm:p-5 flex flex-col gap-4"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cheque-type">Jenis</Label>
            <FormSelect
              id="cheque-type"
              name="type"
              options={[
                { value: "giro", label: "Giro" },
                { value: "cek", label: "Cek" },
              ]}
              defaultValue={type}
              onValueChange={setType}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cheque-direction">Arah</Label>
            <FormSelect
              id="cheque-direction"
              name="direction"
              options={[
                { value: "in", label: "Diterima (dari pelanggan)" },
                { value: "out", label: "Dikeluarkan (ke pemasok)" },
              ]}
              defaultValue={direction}
              onValueChange={setDirection}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cheque-number">Nomor Giro/Cek</Label>
            <Input id="cheque-number" value={number} onChange={(event) => setNumber(event.target.value)} placeholder="Nomor lembar" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cheque-party">Pihak</Label>
            <Input id="cheque-party" value={party} onChange={(event) => setParty(event.target.value)} placeholder="Pelanggan / pemasok" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cheque-account">Rekening Bank</Label>
            <Combobox
              id="cheque-account"
              options={accountOptions}
              value={accountId || null}
              onChange={(value) => setAccountId(value ?? "")}
              placeholder="Pilih rekening..."
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cheque-amount">Nominal *</Label>
            <CurrencyInput id="cheque-amount" value={amount} onChange={setAmount} placeholder="0" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <AppDatePicker label="Jatuh Tempo *" name="dueDate" value={dueDate} onChange={setDueDate} required />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-2">
            <Label htmlFor="cheque-notes">Catatan</Label>
            <Textarea id="cheque-notes" value={notes} onChange={(event) => setNotes(event.target.value)} rows={1} placeholder="Opsional" />
          </div>
        </div>
        <div className="flex justify-end">
          <Button type="submit" variant="primary" size="sm" isDisabled={isPending} id="create-cheque-btn">
            {isPending ? "Menyimpan..." : "Catat Giro/Cek"}
          </Button>
        </div>
      </form>

      <DetailTable data-report-table="Daftar Giro & Cek">
        <DetailTableHead>
          <DetailTableTh>Jatuh Tempo</DetailTableTh>
          <DetailTableTh>No. Dokumen</DetailTableTh>
          <DetailTableTh>Nomor</DetailTableTh>
          <DetailTableTh>Jenis</DetailTableTh>
          <DetailTableTh>Arah</DetailTableTh>
          <DetailTableTh>Pihak</DetailTableTh>
          <DetailTableTh>Rekening</DetailTableTh>
          <DetailTableTh align="right">Nominal</DetailTableTh>
          <DetailTableTh>Status</DetailTableTh>
          <DetailTableTh align="right">Aksi</DetailTableTh>
        </DetailTableHead>
        <DetailTableBody>
          {cheques.map((cheque) => (
            <DetailTableRow key={cheque.id}>
              <DetailTableTd>{cheque.dueDate}</DetailTableTd>
              <DetailTableTd className="font-mono text-sm">{cheque.documentNo}</DetailTableTd>
              {/* Nomor giro/cek milik bank harus terlihat: sebelumnya kolom Pihak memakai
                  `party ?? number`, jadi nomor yang diisi pengguna tak pernah tampil. */}
              <DetailTableTd className="font-mono text-sm">{cheque.number ?? "–"}</DetailTableTd>
              <DetailTableTd>{TYPE_LABEL[cheque.type] ?? cheque.type}</DetailTableTd>
              <DetailTableTd>{cheque.direction === "in" ? "Diterima" : "Dikeluarkan"}</DetailTableTd>
              <DetailTableTd>{cheque.party ?? "–"}</DetailTableTd>
              <DetailTableTd>{cheque.accountLabel ?? "–"}</DetailTableTd>
              <DetailTableTd align="right" className="tabular-nums">{formatAccounting(cheque.amount)}</DetailTableTd>
              <DetailTableTd>{STATUS_LABEL[cheque.status] ?? cheque.status}</DetailTableTd>
              <DetailTableTd align="right">
                <div className="flex items-center justify-end gap-1.5">
                  {cheque.status === "pending" && (
                    <>
                      <Button type="button" size="sm" variant="ghost" isDisabled={isPending} onPress={() => handleStatus(cheque.id, "cleared")} className="gap-1 text-success" aria-label={`Tandai cair ${cheque.documentNo}`}>
                        <BadgeCheck size={15} aria-hidden="true" /> Cair
                      </Button>
                      <Button type="button" size="sm" variant="ghost" isDisabled={isPending} onPress={() => handleStatus(cheque.id, "cancelled")} className="gap-1" aria-label={`Batalkan ${cheque.documentNo}`}>
                        <Ban size={15} aria-hidden="true" /> Batal
                      </Button>
                    </>
                  )}
                  <Button type="button" size="sm" variant="ghost" isDisabled={isPending} onPress={() => handleDelete(cheque.id)} className="gap-1 text-danger" aria-label={`Hapus ${cheque.documentNo}`}>
                    <Trash2 size={15} aria-hidden="true" />
                  </Button>
                </div>
              </DetailTableTd>
            </DetailTableRow>
          ))}
          {cheques.length === 0 && (
            <DetailTableRow>
              <DetailTableTd colSpan={9}><EmptyState title="Belum ada giro/cek tercatat." description="Catat giro mundur di atas agar laporan Giro Mundur terisi." className="py-6" /></DetailTableTd>
            </DetailTableRow>
          )}
        </DetailTableBody>
      </DetailTable>
    </div>
  )
}
