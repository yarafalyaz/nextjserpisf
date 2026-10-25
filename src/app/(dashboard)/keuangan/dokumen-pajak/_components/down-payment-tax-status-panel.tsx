"use client"

import { useRef, useState } from "react"

import { issueDownPaymentTaxInvoiceAction } from "@/actions/tax-documents.actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/shadcn/input"
import { Label } from "@/components/ui/shadcn/label"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import { useTaxDocAction } from "./tax-doc-submit"

/** Baris serializable dari loader `loadDownPaymentTaxStatusRows` (verbatim server). */
export interface DownPaymentTaxStatusPanelRow {
  downPaymentId: number
  documentNo: string | null
  customerName: string | null
  paymentDate: string
  amount: number
  dpStatus: string
  vatDpp: number | null
  vatAmount: number | null
  vatTaxPeriod: string | null
  pkpStatusSnapshot: string | null
  pkpEffectiveFromSnapshot: string | null
  pkpSnapshotLabel: string
  taxInvoiceId: number | null
  taxInvoiceNumber: string | null
  taxStatus: string
  taxStatusLabel: string
}

const BADGE_CLASS: Record<string, string> = {
  "terutang-belum-terbit": "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  "fp-um-terbit": "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  "fp-um-batal": "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
}

/**
 * Panel status pajak uang muka (F-2026-10-25-004-V konsumen PR #785 merged).
 *
 * Semua angka + label status adalah snapshot server dari loader
 * `loadDownPaymentTaxStatusRows` — UI TIDAK menghitung DPP/PPN/status.
 * Form terbit FP UM hanya untuk baris `terutang-belum-terbit` dan hanya
 * bila `canIssue` (izin `create_tax_invoices`); nomor seri DJP diinput
 * manusia, sistem tidak mengarang. Galat service tampil verbatim.
 */
export function DownPaymentTaxStatusPanel({
  rows,
  canIssue,
}: {
  rows: DownPaymentTaxStatusPanelRow[]
  canIssue: boolean
}) {
  const { isPending, run } = useTaxDocAction()
  const [openId, setOpenId] = useState<number | null>(null)
  const keyRef = useRef<string>(crypto.randomUUID())

  function submit(e: React.FormEvent<HTMLFormElement>, downPaymentId: number) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    formData.set("downPaymentId", String(downPaymentId))
    formData.set("idempotencyKey", keyRef.current)
    run(issueDownPaymentTaxInvoiceAction, formData, "FP uang muka diterbitkan")
    keyRef.current = crypto.randomUUID()
  }

  return (
    <section aria-label="Status pajak uang muka" className="bg-surface rounded-xl border border-default shadow-sm p-6">
      <h2 className="text-base font-semibold text-foreground">Status Pajak Uang Muka (DP)</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Snapshot PPN per DP confirmed dari server — DPP, PPN, masa pajak, dan status PKP perusahaan tampil apa adanya tanpa hitung ulang.
      </p>

      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Belum ada uang muka confirmed.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm" aria-label="Daftar status pajak uang muka">
            <thead>
              <tr className="border-b border-default text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="py-2 pr-3 font-medium">Dokumen DP</th>
                <th scope="col" className="py-2 pr-3 font-medium">Pelanggan</th>
                <th scope="col" className="py-2 pr-3 font-medium">Tanggal Bayar</th>
                <th scope="col" className="py-2 pr-3 font-medium text-right">Jumlah DP</th>
                <th scope="col" className="py-2 pr-3 font-medium text-right">DPP Snapshot</th>
                <th scope="col" className="py-2 pr-3 font-medium text-right">PPN Snapshot</th>
                <th scope="col" className="py-2 pr-3 font-medium">Masa Pajak</th>
                <th scope="col" className="py-2 pr-3 font-medium">Status PKP Saat Confirm</th>
                <th scope="col" className="py-2 pr-3 font-medium">Status Pajak</th>
                <th scope="col" className="py-2 font-medium">FP Uang Muka</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <FragmentRow
                  key={row.downPaymentId}
                  row={row}
                  canIssue={canIssue}
                  isOpen={openId === row.downPaymentId}
                  isPending={isPending}
                  onToggle={() => setOpenId(openId === row.downPaymentId ? null : row.downPaymentId)}
                  onSubmit={submit}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function FragmentRow({
  row,
  canIssue,
  isOpen,
  isPending,
  onToggle,
  onSubmit,
}: {
  row: DownPaymentTaxStatusPanelRow
  canIssue: boolean
  isOpen: boolean
  isPending: boolean
  onToggle: () => void
  onSubmit: (e: React.FormEvent<HTMLFormElement>, downPaymentId: number) => void
}) {
  const showForm = canIssue && row.taxStatus === "terutang-belum-terbit"
  return (
    <>
      <tr className="border-b border-default align-top">
        <td className="py-2 pr-3 font-mono">{row.documentNo ?? "—"}</td>
        <td className="py-2 pr-3">{row.customerName ?? "—"}</td>
        <td className="py-2 pr-3 whitespace-nowrap">{formatDate(row.paymentDate)}</td>
        <td className="py-2 pr-3 text-right whitespace-nowrap">{formatCurrency(row.amount)}</td>
        <td className="py-2 pr-3 text-right whitespace-nowrap">{row.vatDpp === null ? "—" : formatCurrency(row.vatDpp)}</td>
        <td className="py-2 pr-3 text-right whitespace-nowrap">{row.vatAmount === null ? "—" : formatCurrency(row.vatAmount)}</td>
        <td className="py-2 pr-3 whitespace-nowrap">{row.vatTaxPeriod ?? "—"}</td>
        <td className="py-2 pr-3">
          {row.pkpSnapshotLabel}
          {row.pkpEffectiveFromSnapshot ? (
            <span className="block text-xs text-muted-foreground">efektif {formatDate(row.pkpEffectiveFromSnapshot)}</span>
          ) : null}
        </td>
        <td className="py-2 pr-3">
          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${BADGE_CLASS[row.taxStatus] ?? "bg-muted text-muted-foreground"}`}>
            {row.taxStatusLabel}
          </span>
        </td>
        <td className="py-2 whitespace-nowrap">
          {row.taxInvoiceNumber ?? "—"}
          {showForm && (
            <div className="mt-1">
              <Button type="button" variant="outline" isDisabled={isPending} onClick={onToggle} aria-expanded={isOpen}>
                {isOpen ? "Tutup Form" : "Terbit FP Uang Muka"}
              </Button>
            </div>
          )}
        </td>
      </tr>
      {showForm && isOpen && (
        <tr className="border-b border-default">
          <td colSpan={10} className="py-3">
            <form
              onSubmit={(e) => onSubmit(e, row.downPaymentId)}
              aria-busy={isPending}
              aria-label={`Formulir terbit FP uang muka ${row.documentNo ?? row.downPaymentId}`}
              className="grid grid-cols-1 gap-4 sm:grid-cols-2"
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`dp-tax-number-${row.downPaymentId}`}>Nomor Seri Faktur Pajak (DJP) <span className="text-destructive" aria-hidden="true">*</span></Label>
                <Input id={`dp-tax-number-${row.downPaymentId}`} name="taxInvoiceNumber" required maxLength={50} placeholder="mis. 010.000-26.00000001" />
                <p className="text-xs text-muted-foreground">Nomor seri dari DJP — sistem tidak mengarang nomor.</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`dp-tax-name-${row.downPaymentId}`}>Nama Lawan Transaksi</Label>
                <Input id={`dp-tax-name-${row.downPaymentId}`} name="counterpartyName" maxLength={200} placeholder="Opsional — kosongkan = snapshot service" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`dp-tax-id-${row.downPaymentId}`}>NPWP Lawan Transaksi</Label>
                <Input id={`dp-tax-id-${row.downPaymentId}`} name="counterpartyTaxId" maxLength={200} placeholder="Opsional" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`dp-tax-nitku-${row.downPaymentId}`}>NITKU Lawan Transaksi</Label>
                <Input id={`dp-tax-nitku-${row.downPaymentId}`} name="counterpartyNitku" maxLength={200} placeholder="Opsional" />
              </div>
              <div className="sm:col-span-2">
                <Button type="submit" isDisabled={isPending}>{isPending ? "Menerbitkan…" : "Terbitkan FP Uang Muka"}</Button>
              </div>
            </form>
          </td>
        </tr>
      )}
    </>
  )
}
