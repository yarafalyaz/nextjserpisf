import Link from "next/link"
import type { SupplierClaimAging } from "@/lib/reports/supplier-claim-aging"
import {
  SUPPLIER_CLAIM_AGING_EMPTY_TEXT,
  SUPPLIER_CLAIM_AGING_NOTICE_TEXT,
  SUPPLIER_CLAIM_AGING_TITLE,
} from "@/lib/reports/supplier-claim-aging"
import { formatDate, formatNumber } from "@/lib/utils/format"
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
} from "@/components/ui/detail-table"

/**
 * F-2026-10-24-095-S BR-SUPP-11: daftar aging klaim supplier terbuka.
 * Komponen murni presentasi atas `SupplierClaimAging` dari loader server
 * (`getSupplierClaimAging`): umur, ember, dan label status ditempel apa
 * adanya — UI TIDAK menghitung ulang umur/status/ember, tidak ada nominal
 * recovery/biaya di kontrak (plafon E3 milik server), tanpa telepon
 * pelanggan (tidak pernah dipilih loader), tanpa aksi mutasi.
 */
export function SupplierClaimAgingCard({
  aging,
}: Readonly<{ aging: SupplierClaimAging }>) {
  const { rows, summary } = aging

  return (
    <section
      aria-label={SUPPLIER_CLAIM_AGING_TITLE}
      className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 px-5 border-b border-default">
        <h2 className="text-[0.9375rem] font-semibold text-foreground">
          {SUPPLIER_CLAIM_AGING_TITLE}
        </h2>
        <p className="text-xs text-muted-foreground">
          {formatNumber(summary.totalOpen)} klaim terbuka
          {summary.oldestAgeDays != null
            ? ` · tertua ${formatNumber(summary.oldestAgeDays)} hari`
            : ""}
        </p>
      </div>
      <div className="p-4 px-5 flex flex-col gap-4">
        <p className="text-xs text-muted-foreground">{SUPPLIER_CLAIM_AGING_NOTICE_TEXT}</p>
        <p className="text-xs text-muted-foreground">
          {summary.byStatus
            .map((s) => `${s.label}: ${formatNumber(s.claimCount)}`)
            .join(" · ")}
          {" — "}
          {summary.buckets
            .map((b) => `${b.label}: ${formatNumber(b.claimCount)}`)
            .join(" · ")}
        </p>
        {rows.length === 0 ? (
          <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            {SUPPLIER_CLAIM_AGING_EMPTY_TEXT}
          </p>
        ) : (
          <DetailTable>
            <DetailTableHead>
              <DetailTableTh>Klaim</DetailTableTh>
              <DetailTableTh>Supplier</DetailTableTh>
              <DetailTableTh>Part</DetailTableTh>
              <DetailTableTh>Tanggal Pengajuan</DetailTableTh>
              <DetailTableTh>Status Klaim</DetailTableTh>
              <DetailTableTh align="right">Umur</DetailTableTh>
              <DetailTableTh>Ember Umur</DetailTableTh>
              <DetailTableTh>Referensi / Retur</DetailTableTh>
              <DetailTableTh>Pelanggan / Kendaraan</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {rows.map((row) => (
                <DetailTableRow key={row.claimId}>
                  <DetailTableTd>
                    <Link
                      href={`/produksi/garansi/${row.claimId}`}
                      className="text-primary hover:underline"
                    >
                      #{formatNumber(row.claimId)}
                    </Link>
                  </DetailTableTd>
                  <DetailTableTd>{row.vendorName ?? "—"}</DetailTableTd>
                  <DetailTableTd>
                    {row.itemName}
                    <span className="block text-xs text-muted-foreground">{row.itemSku}</span>
                    {row.serialNumber ? (
                      <span className="block font-mono text-xs text-muted-foreground">
                        {row.serialNumber}
                      </span>
                    ) : null}
                  </DetailTableTd>
                  <DetailTableTd>
                    {row.supplierClaimAt
                      ? formatDate(row.supplierClaimAt)
                      : (row.ageDateLabel ?? "—")}
                  </DetailTableTd>
                  <DetailTableTd>
                    <span className="inline-flex items-center rounded-full border border-default px-2 py-0.5 text-xs font-medium text-foreground">
                      {row.supplierClaimStatusLabel}
                    </span>
                  </DetailTableTd>
                  <DetailTableTd align="right">
                    {row.ageDays === null ? "—" : `${formatNumber(row.ageDays)} hari`}
                  </DetailTableTd>
                  <DetailTableTd>{row.ageBucketLabel}</DetailTableTd>
                  <DetailTableTd>
                    {row.supplierClaimRefNo ?? "—"}
                    {row.purchaseReturnDocumentNo ? (
                      <span className="block text-xs text-muted-foreground">
                        Retur {row.purchaseReturnDocumentNo}
                        {row.purchaseReturnStatus ? ` (${row.purchaseReturnStatus})` : ""}
                      </span>
                    ) : null}
                  </DetailTableTd>
                  <DetailTableTd>
                    {row.customerName}
                    {row.plateNumber || row.vehicleName ? (
                      <span className="block text-xs text-muted-foreground">
                        {[row.plateNumber, row.vehicleName].filter(Boolean).join(" · ")}
                      </span>
                    ) : null}
                  </DetailTableTd>
                </DetailTableRow>
              ))}
            </DetailTableBody>
          </DetailTable>
        )}
        <p className="text-xs text-muted-foreground">
          <Link href="/produksi/garansi" className="text-primary hover:underline">
            Buka daftar klaim garansi
          </Link>
        </p>
      </div>
    </section>
  )
}
