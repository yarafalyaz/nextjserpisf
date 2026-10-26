import { Badge } from "@/components/ui/shadcn/badge"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import type { DownPaymentTaxStatus } from "@/lib/tax/down-payment-vat"

/**
 * Snapshot PPN per uang muka — bentuk baris loader
 * `loadDownPaymentTaxStatusRows` (src/lib/reports/down-payment-tax-status-data)
 * apa adanya. UI menampilkan verbatim dari server: nol hitung DPP/PPN,
 * nol turun status, label PKP = pkpSnapshotLabel server (legacy berlabel
 * server, bukan ditebak UI). Dipakai panel laporan pajak DAN permukaan
 * pembayaran/detail DP (konsumen PR #785, F-2026-10-25-004-V + 015-V).
 */
export interface DownPaymentVatSnapshotView {
  vatDpp: number | null
  vatAmount: number | null
  vatTaxPeriod: string | null
  pkpStatusSnapshot: string | null
  pkpEffectiveFromSnapshot: Date | string | null
  pkpSnapshotLabel: string
  taxInvoiceNumber: string | null
  taxStatus: DownPaymentTaxStatus
  taxStatusLabel: string
}

const BADGE_VARIANT: Record<DownPaymentTaxStatus, "default" | "secondary" | "outline" | "destructive"> = {
  "bukan-subjek": "secondary",
  "terutang-belum-terbit": "default",
  "fp-um-terbit": "outline",
  "fp-um-batal": "destructive",
}

/** Badge status pajak verbatim server (label dari DOWN_PAYMENT_TAX_STATUS_LABELS). */
export function DownPaymentTaxStatusBadge({ snapshot }: { snapshot: DownPaymentVatSnapshotView }) {
  return <Badge variant={BADGE_VARIANT[snapshot.taxStatus]}>{snapshot.taxStatusLabel}</Badge>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</dt>
      <dd className="text-[0.9375rem] text-foreground font-medium m-0">{children}</dd>
    </div>
  )
}

/**
 * Kartu snapshot PPN per DP (presentasi murni, tanpa fetch/hitung).
 * Snapshot null (DP legacy pra-fitur / belum confirmed) tampil sebagai
 * teks status eksplisit dari label server — bukan angka kosong.
 */
export function DownPaymentVatSnapshotCard({ snapshot }: { snapshot: DownPaymentVatSnapshotView }) {
  const hasSnapshot = snapshot.vatAmount !== null
  return (
    <section aria-label="Snapshot PPN uang muka" className="bg-surface rounded-xl border border-default shadow-sm p-6">
      <h2 className="text-base font-semibold text-foreground">Snapshot PPN Uang Muka</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Nilai dibekukan server saat uang muka dikonfirmasi dan tampil apa adanya — halaman ini tidak menghitung ulang PPN.
      </p>
      <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="DPP Uang Muka">{hasSnapshot ? formatCurrency(snapshot.vatDpp ?? 0) : "Belum ada snapshot PPN tercatat"}</Field>
        <Field label="PPN Uang Muka">{hasSnapshot ? formatCurrency(snapshot.vatAmount ?? 0) : "Belum ada snapshot PPN tercatat"}</Field>
        <Field label="Masa Pajak">{snapshot.vatTaxPeriod ?? "—"}</Field>
        <Field label="Status PKP Perusahaan (snapshot)">{snapshot.pkpSnapshotLabel}</Field>
        <Field label="PKP Berlaku Sejak (snapshot)">
          {snapshot.pkpEffectiveFromSnapshot ? formatDate(snapshot.pkpEffectiveFromSnapshot) : "—"}
        </Field>
        <Field label="Status Pajak">
          <DownPaymentTaxStatusBadge snapshot={snapshot} />
        </Field>
        <Field label="Faktur Pajak Uang Muka">{snapshot.taxInvoiceNumber ?? "—"}</Field>
      </dl>
    </section>
  )
}
