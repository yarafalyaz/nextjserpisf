import type {
  SalesTargetAchievement,
  SalesTargetPeriodReconciliation,
} from "@/lib/reports/sales-target-achievement"
import { SALES_TARGET_UNATTRIBUTED_LABEL } from "@/lib/reports/sales-target-achievement"
import { formatCurrency } from "@/lib/utils/format"
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
  DetailTableFoot,
  DetailTableFootRow,
} from "@/components/ui/detail-table"
import { ReportCardShell } from "./report-card-shell"

/**
 * F-2026-10-24-131-V Putusan 5: panel rekonsiliasi tiga arah periode sama.
 * Murni presentasi dari builder server `buildSalesTargetPeriodReconciliation`
 * (lewat loader `getSalesTargetPeriodReconciliation`): angka, selisih, dan
 * temuan bernama ditempel apa adanya — UI tidak menghitung ulang, tidak
 * memilih status retur, dan tidak memilih salah satu sisi selisih.
 * Nama penjual dipetakan dari laporan pencapaian yang sudah dimuat page
 * (id yang sama); tanpa nama tampil label tanpa-penjual builder.
 */
export function SalesTargetReconciliationCard({
  reconciliation,
  report,
}: Readonly<{
  reconciliation: SalesTargetPeriodReconciliation
  report: SalesTargetAchievement
}>) {
  const nameById = new Map<number, string>()
  for (const row of [...report.rows, ...report.noTargetRows]) {
    if (row.salesEmployeeName) nameById.set(row.salesEmployeeId, row.salesEmployeeName)
  }
  const sellerLabel = (id: number | null) =>
    id === null ? SALES_TARGET_UNATTRIBUTED_LABEL : (nameById.get(id) ?? `Penjual #${id}`)

  const rowFindings = reconciliation.rows.flatMap((row) =>
    row.findings.map((finding) => ({ finding, seller: sellerLabel(row.salesEmployeeId) })),
  )
  const hasContent =
    reconciliation.rows.length > 0 ||
    reconciliation.findings.length > 0 ||
    reconciliation.invoiceDeductionClampFindings.length > 0

  return (
    <ReportCardShell
      label="rekonsiliasi target penjualan"
      title="Rekonsiliasi Target Penjualan"
      summary={<>Perbandingan tiga arah periode ini dari builder server.</>}
      isEmpty={!hasContent}
      emptyText="Tidak ada data rekonsiliasi pada masa ini."
    >
      <DetailTable data-report-table="rekonsiliasi target penjualan">
        <DetailTableHead>
          <DetailTableTh>Penjual</DetailTableTh>
          <DetailTableTh align="right">Bruto Target (Rp)</DetailTableTh>
          <DetailTableTh align="right">PaidBase Komisi (Rp)</DetailTableTh>
          <DetailTableTh align="right">Selisih Bruto (Rp)</DetailTableTh>
          <DetailTableTh align="right">Retur Read-Model (Rp)</DetailTableTh>
          <DetailTableTh align="right">Retur Sumber Independen (Rp)</DetailTableTh>
          <DetailTableTh align="right">Selisih Retur (Rp)</DetailTableTh>
          <DetailTableTh align="right">Pencapaian Neto (Rp)</DetailTableTh>
        </DetailTableHead>
        <DetailTableBody>
          {reconciliation.rows.map((row) => (
            <DetailTableRow key={row.salesEmployeeId ?? "unattributed"}>
              <DetailTableTd className="font-medium">{sellerLabel(row.salesEmployeeId)}</DetailTableTd>
              <DetailTableTd align="right">{formatCurrency(row.grossPaidAmount)}</DetailTableTd>
              <DetailTableTd align="right">
                {row.commissionPaidBase !== null ? formatCurrency(row.commissionPaidBase) : ""}
              </DetailTableTd>
              <DetailTableTd align="right">
                {row.commissionDifference !== null ? formatCurrency(row.commissionDifference) : ""}
              </DetailTableTd>
              <DetailTableTd align="right">{formatCurrency(row.returnDeductionAmount)}</DetailTableTd>
              <DetailTableTd align="right">
                {row.independentReturnDeductionAmount !== null
                  ? formatCurrency(row.independentReturnDeductionAmount)
                  : ""}
              </DetailTableTd>
              <DetailTableTd align="right">
                {row.independentDifference !== null ? formatCurrency(row.independentDifference) : ""}
              </DetailTableTd>
              <DetailTableTd align="right">{formatCurrency(row.achievedAmount)}</DetailTableTd>
            </DetailTableRow>
          ))}
        </DetailTableBody>
        <DetailTableFoot>
          <DetailTableFootRow>
            <DetailTableTd className="font-bold">Total</DetailTableTd>
            <DetailTableTd align="right" className="font-bold">
              {formatCurrency(reconciliation.totals.grossPaidAmount)}
            </DetailTableTd>
            <DetailTableTd align="right" className="font-bold">
              {formatCurrency(reconciliation.totals.commissionPaidBase)}
            </DetailTableTd>
            <DetailTableTd align="right" className="font-bold">
              {formatCurrency(reconciliation.totals.commissionDifference)}
            </DetailTableTd>
            <DetailTableTd align="right" className="font-bold">
              {formatCurrency(reconciliation.totals.returnDeductionAmount)}
            </DetailTableTd>
            <DetailTableTd align="right" className="font-bold">
              {formatCurrency(reconciliation.totals.independentReturnDeductionAmount)}
            </DetailTableTd>
            <DetailTableTd align="right" className="font-bold">
              {formatCurrency(reconciliation.totals.independentDifference)}
            </DetailTableTd>
            <DetailTableTd align="right" className="font-bold">
              {formatCurrency(reconciliation.totals.achievedAmount)}
            </DetailTableTd>
          </DetailTableFootRow>
        </DetailTableFoot>
      </DetailTable>

      <p className="mt-4 text-sm text-muted-foreground">
        Kaki Retur Penjualan jurnal retur POSTED:{" "}
        {reconciliation.totals.postedJournalReturnAmount !== null
          ? formatCurrency(reconciliation.totals.postedJournalReturnAmount)
          : "Belum terukur — akun Retur Penjualan belum dipetakan."}
        {reconciliation.totals.journalDifference !== null
          ? ` · Selisih terhadap retur read-model: ${formatCurrency(reconciliation.totals.journalDifference)}`
          : ""}
      </p>

      {rowFindings.length > 0 || reconciliation.findings.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-foreground">Temuan rekonsiliasi</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {rowFindings.map(({ finding, seller }) => (
              <li key={`${finding.code}-${seller}`}>
                {seller}: {finding.message}
              </li>
            ))}
            {reconciliation.findings.map((finding) => (
              <li key={finding.code}>{finding.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {reconciliation.invoiceDeductionClampFindings.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-foreground">Temuan plafon pengurang per faktur</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {reconciliation.invoiceDeductionClampFindings.map((finding) => (
              <li key={finding.salesInvoiceId}>
                Faktur #{finding.salesInvoiceId}: pengurang mentah{" "}
                {formatCurrency(finding.rawDeductionAmount)} ditahan pada total faktur{" "}
                {formatCurrency(finding.grandTotal)} menjadi{" "}
                {formatCurrency(finding.clampedDeductionAmount)}.
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </ReportCardShell>
  )
}
