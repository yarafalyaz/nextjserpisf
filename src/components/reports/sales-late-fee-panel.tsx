"use client"

import { useRouter } from "next/navigation"
import { useRef, useState, useTransition } from "react"

import {
  createCustomerLateFeeTerm,
  issueSalesLateFee,
  paySalesLateFee,
  reverseSalesLateFee,
} from "@/actions/sales-late-fee.actions"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { AppDatePicker } from "@/components/ui/date-picker"
import { FormSelect } from "@/components/ui/form-select"
import { Button } from "@/components/ui/button"
import { StatusChip } from "@/components/ui/status-chip"
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
} from "@/components/ui/detail-table"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/shadcn/dialog"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import { showError, showSuccess } from "@/lib/utils/toast"
import {
  SALES_LATE_FEE_ACCOUNT_UNSET_TEXT,
  SALES_LATE_FEE_NOTICE_TEXT,
  SALES_LATE_FEE_TITLE,
  type SalesLateFeeDocumentView,
  type SalesLateFeePanelData,
} from "@/lib/reports/sales-late-fee"

// Idempotency key per intent (pola sales-invoice-form): key baru hanya
// sesudah sukses; submit ulang intent sama memakai key yang sama.
function newIdempotencyKey(): string {
  return crypto.randomUUID()
}

const STATUS_TONES: Record<string, "success" | "warning" | "danger" | "default"> = {
  paid: "success",
  posted: "success",
  partial: "warning",
  reversed: "danger",
  draft: "default",
}

function TermForm({
  panel,
  onDone,
}: Readonly<{ panel: SalesLateFeePanelData; onDone: () => void }>) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [basis, setBasis] = useState("rate")

  function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    if (basis === "rate") formData.delete("flatAmountPerDay")
    else formData.delete("ratePercentPerDay")
    startTransition(async () => {
      const result = await createCustomerLateFeeTerm(formData)
      if (!result.success) {
        showError(result.error ?? "Gagal menyimpan syarat denda.")
        return
      }
      showSuccess("Syarat denda pelanggan tersimpan.")
      onDone()
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <input type="hidden" name="customerId" value={panel.customerId} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="late-fee-term-basis">Basis Tarif</Label>
        <FormSelect
          id="late-fee-term-basis"
          value={basis}
          onValueChange={setBasis}
          options={[
            { value: "rate", label: "Persen per Hari" },
            { value: "flat", label: "Nominal per Hari" },
          ]}
        />
      </div>
      {basis === "rate" ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="late-fee-rate">Tarif Persen per Hari (%)</Label>
          <Input
            id="late-fee-rate"
            name="ratePercentPerDay"
            type="number"
            min="0"
            step="0.000001"
            inputMode="decimal"
            required
            placeholder="0"
          />
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="late-fee-flat">Tarif Nominal per Hari (Rp)</Label>
          <Input
            id="late-fee-flat"
            name="flatAmountPerDay"
            type="number"
            min="1"
            step="0.01"
            inputMode="decimal"
            required
            placeholder="0"
          />
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="late-fee-cap">Plafon Denda (opsional)</Label>
        <Input
          id="late-fee-cap"
          name="capAmount"
          type="number"
          min="1"
          step="0.01"
          inputMode="decimal"
          placeholder="0"
        />
      </div>
      <AppDatePicker label="Efektif Dari" name="effectiveFrom" required />
      <AppDatePicker label="Efektif Sampai (opsional)" name="effectiveTo" />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="late-fee-term-notes">Catatan (opsional)</Label>
        <Textarea id="late-fee-term-notes" name="notes" rows={2} />
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="submit" isPending={isPending}>
          {isPending ? "Menyimpan…" : "Simpan Syarat Denda"}
        </Button>
      </div>
    </form>
  )
}

function IssueForm({
  panel,
  onDone,
}: Readonly<{ panel: SalesLateFeePanelData; onDone: () => void }>) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [termId, setTermId] = useState(
    panel.terms.length > 0 ? String(panel.terms[0].id) : "",
  )
  const idempotencyKeyRef = useRef<string>(newIdempotencyKey())

  function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    formData.set("idempotencyKey", idempotencyKeyRef.current)
    startTransition(async () => {
      const result = await issueSalesLateFee(formData)
      if (!result.success) {
        showError(result.error ?? "Gagal menerbitkan dokumen denda.")
        return
      }
      idempotencyKeyRef.current = newIdempotencyKey()
      showSuccess(
        result.documentNo
          ? `Dokumen denda ${result.documentNo} diterbitkan.`
          : "Dokumen denda diterbitkan.",
      )
      onDone()
      router.refresh()
    })
  }

  if (panel.terms.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Pelanggan ini belum punya syarat denda. Buat syarat denda dulu lewat
        tombol Syarat Denda.
      </p>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <input type="hidden" name="salesInvoiceId" value={panel.salesInvoiceId} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="late-fee-issue-term">Syarat Denda</Label>
        <FormSelect
          id="late-fee-issue-term"
          name="termId"
          value={termId}
          onValueChange={setTermId}
          options={panel.terms.map((term) => ({
            value: String(term.id),
            label: `${term.rateLabel} · efektif ${formatDate(term.effectiveFrom)}${term.effectiveTo ? ` s.d. ${formatDate(term.effectiveTo)}` : ""}`,
          }))}
        />
      </div>
      <AppDatePicker
        label="Tanggal Terbit"
        name="date"
        required
        defaultValue={new Date()}
      />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="late-fee-issue-notes">Catatan (opsional)</Label>
        <Textarea id="late-fee-issue-notes" name="notes" rows={2} />
      </div>
      {!panel.lateFeeIncomeAccountSet ? (
        <p role="alert" className="text-sm text-destructive">
          {SALES_LATE_FEE_ACCOUNT_UNSET_TEXT}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="submit" isPending={isPending}>
          {isPending ? "Menerbitkan…" : "Terbitkan Dokumen Denda"}
        </Button>
      </div>
    </form>
  )
}

function PayForm({
  doc,
  accounts,
  paymentMethods,
  onDone,
}: Readonly<{
  doc: SalesLateFeeDocumentView
  accounts: { id: number; code: string; name: string }[]
  paymentMethods: { code: string; name: string }[]
  onDone: () => void
}>) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [method, setMethod] = useState(
    paymentMethods.length > 0 ? paymentMethods[0].code : "",
  )
  const [accountId, setAccountId] = useState("")
  const idempotencyKeyRef = useRef<string>(newIdempotencyKey())

  function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    formData.set("idempotencyKey", idempotencyKeyRef.current)
    startTransition(async () => {
      const result = await paySalesLateFee(formData)
      if (!result.success) {
        showError(result.error ?? "Gagal mencatat pembayaran denda.")
        return
      }
      idempotencyKeyRef.current = newIdempotencyKey()
      showSuccess("Pembayaran dokumen denda tercatat.")
      onDone()
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <input type="hidden" name="salesLateFeeId" value={doc.id} />
      <p className="text-sm text-muted-foreground">
        Sisa saldo {doc.documentNo}: {formatCurrency(doc.outstanding)}
      </p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`late-fee-pay-amount-${doc.id}`}>Nominal Pembayaran</Label>
        <Input
          id={`late-fee-pay-amount-${doc.id}`}
          name="amount"
          type="number"
          min="1"
          step="0.01"
          inputMode="decimal"
          required
          placeholder="0"
        />
      </div>
      <AppDatePicker
        label="Tanggal Pembayaran"
        name="paymentDate"
        required
        defaultValue={new Date()}
      />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`late-fee-pay-method-${doc.id}`}>Metode Pembayaran</Label>
        <FormSelect
          id={`late-fee-pay-method-${doc.id}`}
          name="paymentMethod"
          value={method}
          onValueChange={setMethod}
          options={paymentMethods.map((item) => ({
            value: item.code,
            label: item.name,
          }))}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`late-fee-pay-account-${doc.id}`}>
          Akun Kas/Bank (opsional)
        </Label>
        <FormSelect
          id={`late-fee-pay-account-${doc.id}`}
          name="accountId"
          value={accountId}
          onValueChange={setAccountId}
          options={[
            { value: "", label: "— Tidak dipilih —" },
            ...accounts.map((account) => ({
              value: String(account.id),
              label: `${account.code} - ${account.name}`,
            })),
          ]}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`late-fee-pay-ref-${doc.id}`}>
          No. Referensi (opsional)
        </Label>
        <Input id={`late-fee-pay-ref-${doc.id}`} name="referenceNo" />
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="submit" isPending={isPending}>
          {isPending ? "Menyimpan…" : "Simpan Pembayaran"}
        </Button>
      </div>
    </form>
  )
}

function ReverseForm({
  doc,
  onDone,
}: Readonly<{ doc: SalesLateFeeDocumentView; onDone: () => void }>) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const idempotencyKeyRef = useRef<string>(newIdempotencyKey())

  function submitConfirmed() {
    const form = formRef.current
    if (!form) return
    const formData = new FormData(form)
    formData.set("idempotencyKey", idempotencyKeyRef.current)
    startTransition(async () => {
      const result = await reverseSalesLateFee(formData)
      if (!result.success) {
        showError(result.error ?? "Gagal membalik dokumen denda.")
        return
      }
      idempotencyKeyRef.current = newIdempotencyKey()
      showSuccess("Dokumen denda dibalik.")
      setConfirmOpen(false)
      onDone()
      router.refresh()
    })
  }

  return (
    <>
      <form
        ref={formRef}
        onSubmit={(event) => {
          event.preventDefault()
          setConfirmOpen(true)
        }}
        className="flex flex-col gap-4"
      >
        <input type="hidden" name="salesLateFeeId" value={doc.id} />
        <p className="text-sm text-muted-foreground">
          Pembalikan membuat dokumen reversal untuk {doc.documentNo} sebesar{" "}
          {formatCurrency(doc.amount)}. Dokumen asal tidak dihapus.
        </p>
        <AppDatePicker label="Tanggal Pembalikan" name="date" defaultValue={new Date()} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`late-fee-reverse-reason-${doc.id}`}>
            Alasan Pembalikan
          </Label>
          <Textarea
            id={`late-fee-reverse-reason-${doc.id}`}
            name="reason"
            rows={3}
            required
          />
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="submit" variant="danger" isPending={isPending}>
            {isPending ? "Membalik…" : "Balik Dokumen Denda"}
          </Button>
        </div>
      </form>
      <ConfirmDialog
        isOpen={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Balik dokumen denda ${doc.documentNo}?`}
        body="Pembalikan bersifat permanen dan membuat jurnal reversal. Lanjutkan?"
        confirmLabel="Ya, Balik Dokumen"
        variant="danger"
        isPending={isPending}
        onConfirm={submitConfirmed}
      />
    </>
  )
}

function DialogShell({
  triggerLabel,
  title,
  description,
  children,
}: Readonly<{
  triggerLabel: string
  title: string
  description?: string
  children: (close: () => void) => React.ReactNode
}>) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="min-h-11 sm:min-h-9">
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {children(() => setOpen(false))}
      </DialogContent>
    </Dialog>
  )
}

/**
 * Panel Dokumen Denda Piutang di detail faktur (F-2026-10-22-093-V).
 * Snapshot dokumen tampil apa adanya dari loader; UI tidak menghitung
 * denda dan tidak menyediakan edit nominal posted. Error server tampil
 * verbatim lewat toast.
 */
export function SalesLateFeePanel({
  panel,
  accounts,
  paymentMethods,
  canCreate,
  canReverse,
}: Readonly<{
  panel: SalesLateFeePanelData
  accounts: { id: number; code: string; name: string }[]
  paymentMethods: { code: string; name: string }[]
  canCreate: boolean
  canReverse: boolean
}>) {
  return (
    <section
      aria-label={SALES_LATE_FEE_TITLE}
      className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 px-5 border-b border-default">
        <h2 className="text-[0.9375rem] font-semibold text-foreground">
          {SALES_LATE_FEE_TITLE}
        </h2>
        <p className="text-xs text-muted-foreground">
          {panel.documents.length} dokumen · Saldo denda terutang{" "}
          {formatCurrency(panel.totalOutstanding)}
        </p>
      </div>
      <div className="flex flex-col gap-4 p-4 px-5">
        <p className="text-xs text-muted-foreground">{SALES_LATE_FEE_NOTICE_TEXT}</p>
        {!panel.lateFeeIncomeAccountSet ? (
          <p role="alert" className="text-sm text-destructive">
            {SALES_LATE_FEE_ACCOUNT_UNSET_TEXT}
          </p>
        ) : null}

        {canCreate ? (
          <div className="flex flex-wrap gap-2">
            <DialogShell
              triggerLabel="Syarat Denda"
              title={`Syarat Denda — ${panel.customerName}`}
              description="Syarat kontraktual bertanggal efektif per pelanggan. Tepat satu basis tarif."
            >
              {(close) => <TermForm panel={panel} onDone={close} />}
            </DialogShell>
            <DialogShell
              triggerLabel="Terbitkan Dokumen Denda"
              title={`Terbitkan Dokumen Denda — ${panel.invoiceDocumentNo}`}
              description="Dokumen denda terpisah dari faktur asal; nominal dihitung server dari snapshot syarat."
            >
              {(close) => <IssueForm panel={panel} onDone={close} />}
            </DialogShell>
          </div>
        ) : null}

        {panel.terms.length > 0 ? (
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Syarat Denda Pelanggan
            </h3>
            <div className="mt-2 overflow-x-auto">
              <DetailTable>
                <DetailTableHead>
                  <DetailTableTh>Tarif</DetailTableTh>
                  <DetailTableTh align="right">Nominal per Hari</DetailTableTh>
                  <DetailTableTh align="right">Plafon</DetailTableTh>
                  <DetailTableTh>Efektif Dari</DetailTableTh>
                  <DetailTableTh>Efektif Sampai</DetailTableTh>
                </DetailTableHead>
                <DetailTableBody>
                  {panel.terms.map((term) => (
                    <DetailTableRow key={term.id}>
                      <DetailTableTd>{term.rateLabel}</DetailTableTd>
                      <DetailTableTd align="right">
                        {term.flatAmountPerDay != null
                          ? formatCurrency(term.flatAmountPerDay)
                          : "—"}
                      </DetailTableTd>
                      <DetailTableTd align="right">
                        {term.capAmount != null
                          ? formatCurrency(term.capAmount)
                          : "—"}
                      </DetailTableTd>
                      <DetailTableTd>{formatDate(term.effectiveFrom)}</DetailTableTd>
                      <DetailTableTd>
                        {term.effectiveTo ? formatDate(term.effectiveTo) : "—"}
                      </DetailTableTd>
                    </DetailTableRow>
                  ))}
                </DetailTableBody>
              </DetailTable>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Belum ada syarat denda untuk pelanggan ini.
          </p>
        )}

        {panel.documents.length === 0 ? (
          <p className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
            Belum ada dokumen denda untuk faktur ini
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {panel.documents.map((doc) => (
              <article
                key={doc.id}
                aria-label={`Dokumen denda ${doc.documentNo}`}
                className="rounded-lg border border-default p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-sm font-medium text-foreground">
                      {doc.documentNo}
                      {doc.isReversal ? " (Pembalikan)" : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Terbit {formatDate(doc.date)} · Jatuh tempo acuan{" "}
                      {formatDate(doc.dueReferenceDate)} · Terlambat{" "}
                      {doc.overdueDays} hari
                    </p>
                  </div>
                  <StatusChip
                    status={doc.status}
                    customLabel={doc.statusLabel}
                    customTone={STATUS_TONES[doc.status] ?? "default"}
                  />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-xs text-muted-foreground">Basis Piutang</dt>
                    <dd>{formatCurrency(doc.basisAmount)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Tarif Snapshot</dt>
                    <dd>
                      {doc.ratePercentPerDay != null
                        ? `${doc.ratePercentPerDay}% per hari`
                        : doc.flatAmountPerDay != null
                          ? `${formatCurrency(doc.flatAmountPerDay)} per hari`
                          : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Plafon</dt>
                    <dd>
                      {doc.capAmount != null ? formatCurrency(doc.capAmount) : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Nominal Denda</dt>
                    <dd className="font-medium">{formatCurrency(doc.amount)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Dibayar</dt>
                    <dd>{formatCurrency(doc.paidAmount)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Sisa Saldo Denda</dt>
                    <dd className="font-medium">{formatCurrency(doc.outstanding)}</dd>
                  </div>
                </dl>
                {doc.notes ? (
                  <p className="mt-2 text-xs text-muted-foreground">{doc.notes}</p>
                ) : null}
                {doc.payments.length > 0 ? (
                  <div className="mt-3 overflow-x-auto">
                    <DetailTable>
                      <DetailTableHead>
                        <DetailTableTh>No. Pembayaran</DetailTableTh>
                        <DetailTableTh>Tanggal</DetailTableTh>
                        <DetailTableTh>Metode</DetailTableTh>
                        <DetailTableTh>Referensi</DetailTableTh>
                        <DetailTableTh align="right">Nominal</DetailTableTh>
                      </DetailTableHead>
                      <DetailTableBody>
                        {doc.payments.map((payment) => (
                          <DetailTableRow key={payment.id}>
                            <DetailTableTd className="font-mono">
                              {payment.documentNo}
                            </DetailTableTd>
                            <DetailTableTd>
                              {formatDate(payment.paymentDate)}
                            </DetailTableTd>
                            <DetailTableTd>{payment.paymentMethod}</DetailTableTd>
                            <DetailTableTd>
                              {payment.referenceNo ?? "—"}
                            </DetailTableTd>
                            <DetailTableTd align="right">
                              {formatCurrency(payment.amount)}
                            </DetailTableTd>
                          </DetailTableRow>
                        ))}
                      </DetailTableBody>
                    </DetailTable>
                  </div>
                ) : null}
                {canCreate && doc.canPay ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <DialogShell
                      triggerLabel="Catat Pembayaran Denda"
                      title={`Pembayaran Denda — ${doc.documentNo}`}
                      description="Pembayaran mengurangi saldo dokumen denda saja, bukan sisa faktur asal."
                    >
                      {(close) => (
                        <PayForm
                          doc={doc}
                          accounts={accounts}
                          paymentMethods={paymentMethods}
                          onDone={close}
                        />
                      )}
                    </DialogShell>
                  </div>
                ) : null}
                {canReverse && doc.canReverse ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <DialogShell
                      triggerLabel="Balik Dokumen Denda"
                      title={`Pembalikan Dokumen Denda — ${doc.documentNo}`}
                      description="Koreksi/waiver hanya lewat pembalikan dokumen."
                    >
                      {(close) => <ReverseForm doc={doc} onDone={close} />}
                    </DialogShell>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
