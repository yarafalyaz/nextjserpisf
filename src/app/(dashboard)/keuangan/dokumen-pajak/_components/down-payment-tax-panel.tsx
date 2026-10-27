"use client"

import { useRef, useState } from "react"

import { issueDownPaymentTaxInvoiceAction } from "@/actions/tax-documents.actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/shadcn/input"
import { Label } from "@/components/ui/shadcn/label"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import {
  DownPaymentTaxStatusBadge,
  type DownPaymentVatSnapshotView,
} from "@/app/(dashboard)/penjualan/uang-muka/_components/down-payment-vat-snapshot"
import { useTaxDocAction } from "./tax-doc-submit"

/** Baris panel: bentuk loader `loadDownPaymentTaxStatusRows` apa adanya. */
export interface DownPaymentTaxRowView extends DownPaymentVatSnapshotView {
  downPaymentId: number
  documentNo: string | null
  customerName: string | null
  paymentDate: Date | string
  amount: number
  dpStatus: string
  taxInvoiceId: number | null
}

/**
 * Panel status pajak uang muka (F-2026-10-25-004-V konsumen PR #785).
 *
 * Snapshot PPN + status turunan tampil verbatim dari loader server —
 * UI tidak menghitung DPP/PPN. Terbit FP UM hanya untuk baris
 * `terutang-belum-terbit`; nomor seri DJP wajib diisi operator
 * (sistem tidak mengarang nomor), galat service tampil apa adanya.
 */
export function DownPaymentTaxPanel({ rows, canIssue = false }: { rows: DownPaymentTaxRowView[]; canIssue?: boolean }) {
  const { isPending, run } = useTaxDocAction()
  const [activeId, setActiveId] = useState<number | null>(null)
  const keyRef = useRef<string>(crypto.randomUUID())

  function submit(e: React.FormEvent<HTMLFormElement>, downPaymentId: number) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    formData.set("downPaymentId", String(downPaymentId))
    formData.set("idempotencyKey", keyRef.current)
    run(issueDownPaymentTaxInvoiceAction, formData, "Faktur pajak uang muka diterbitkan")
    keyRef.current = crypto.randomUUID()
  }

  return (
    <section aria-label="Status pajak uang muka" className="bg-surface rounded-xl border border-default shadow-sm p-6">
      <h2 className="text-base font-semibold text-foreground">Status Pajak Uang Muka (DP)</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Snapshot PPN per uang muka tampil apa adanya dari server. Terbitkan faktur pajak uang muka untuk baris yang terutang — nomor seri DJP diisi operator.
      </p>

      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Belum ada uang muka tercatat.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[880px] text-sm" aria-label="Daftar status pajak uang muka">
            <thead>
              <tr className="border-b border-default text-left text-muted-foreground">
                <th scope="col" className="py-2 pr-3 font-medium">Dokumen DP</th>
                <th scope="col" className="py-2 pr-3 font-medium">Pelanggan</th>
                <th scope="col" className="py-2 pr-3 font-medium">Tanggal Bayar</th>
                <th scope="col" className="py-2 pr-3 font-medium text-right">Jumlah DP</th>
                <th scope="col" className="py-2 pr-3 font-medium text-right">DPP Uang Muka</th>
                <th scope="col" className="py-2 pr-3 font-medium text-right">PPN Uang Muka</th>
                <th scope="col" className="py-2 pr-3 font-medium">Masa Pajak</th>
                <th scope="col" className="py-2 pr-3 font-medium">Snapshot PKP</th>
                <th scope="col" className="py-2 pr-3 font-medium">Status Pajak</th>
                <th scope="col" className="py-2 font-medium">Faktur Pajak UM</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <FragmentRow
                  key={row.downPaymentId}
                  row={row}
                  canIssue={canIssue}
                  isPending={isPending}
                  formOpen={activeId === row.downPaymentId}
                  onToggle={() => setActiveId((cur) => (cur === row.downPaymentId ? null : row.downPaymentId))}
                  onSubmit={(e) => submit(e, row.downPaymentId)}
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
  isPending,
  formOpen,
  onToggle,
  onSubmit,
}: {
  row: DownPaymentTaxRowView
  canIssue: boolean
  isPending: boolean
  formOpen: boolean
  onToggle: () => void
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
}) {
  const showForm = canIssue && row.taxStatus === "terutang-belum-terbit"
  return (
    <>
      <tr className="border-b border-default/60 align-top">
        <td className="py-2 pr-3">{row.documentNo ?? "—"}</td>
        <td className="py-2 pr-3">{row.customerName ?? "—"}</td>
        <td className="py-2 pr-3">{formatDate(row.paymentDate)}</td>
        <td className="py-2 pr-3 text-right">{formatCurrency(row.amount)}</td>
        <td className="py-2 pr-3 text-right">{row.vatDpp === null ? "—" : formatCurrency(row.vatDpp)}</td>
        <td className="py-2 pr-3 text-right">{row.vatAmount === null ? "—" : formatCurrency(row.vatAmount)}</td>
        <td className="py-2 pr-3">{row.vatTaxPeriod ?? "—"}</td>
        <td className="py-2 pr-3">{row.pkpSnapshotLabel}</td>
        <td className="py-2 pr-3">
          <DownPaymentTaxStatusBadge snapshot={row} />
        </td>
        <td className="py-2">
          <div className="flex flex-col items-start gap-2">
            <span>{row.taxInvoiceNumber ?? "—"}</span>
            {showForm && (
              <Button
                type="button"
                variant="outline"
                isDisabled={isPending}
                aria-expanded={formOpen}
                onClick={onToggle}
              >
                {formOpen ? "Tutup Form" : "Terbitkan FP Uang Muka"}
              </Button>
            )}
          </div>
        </td>
      </tr>
      {showForm && formOpen && (
        <tr className="border-b border-default/60">
          <td colSpan={10} className="py-3">
            <form
              onSubmit={onSubmit}
              aria-busy={isPending}
              aria-label={`Formulir terbit faktur pajak uang muka ${row.documentNo ?? row.downPaymentId}`}
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`dp-tax-number-${row.downPaymentId}`}>
                  Nomor Seri Faktur Pajak DJP <span className="text-destructive" aria-hidden="true">*</span>
                </Label>
                <Input
                  id={`dp-tax-number-${row.downPaymentId}`}
                  name="taxInvoiceNumber"
                  required
                  maxLength={50}
                  placeholder="mis. 010.000-26.00000001"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`dp-tax-name-${row.downPaymentId}`}>Nama Lawan Transaksi</Label>
                <Input id={`dp-tax-name-${row.downPaymentId}`} name="counterpartyName" maxLength={200} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`dp-tax-id-${row.downPaymentId}`}>NPWP Lawan Transaksi</Label>
                <Input id={`dp-tax-id-${row.downPaymentId}`} name="counterpartyTaxId" maxLength={200} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`dp-tax-nitku-${row.downPaymentId}`}>NITKU Lawan Transaksi</Label>
                <Input id={`dp-tax-nitku-${row.downPaymentId}`} name="counterpartyNitku" maxLength={200} />
              </div>
              <div className="flex items-end gap-2 pb-1">
                <input
                  id={`dp-tax-legacy15-${row.downPaymentId}`}
                  name="legacy15Confirmed"
                  type="checkbox"
                  value="true"
                  className="h-4 w-4"
                />
                <Label htmlFor={`dp-tax-legacy15-${row.downPaymentId}`}>Konfirmasi NPWP 15 digit (format lama)</Label>
              </div>
              <div className="sm:col-span-2 lg:col-span-4">
                <Button type="submit" isDisabled={isPending}>
                  {isPending ? "Menerbitkan…" : "Terbitkan Faktur Pajak Uang Muka"}
                </Button>
              </div>
            </form>
          </td>
        </tr>
      )}
    </>
  )
}
