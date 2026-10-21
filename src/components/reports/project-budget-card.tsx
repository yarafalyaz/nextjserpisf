import { Fragment } from "react"
import type { ProjectBudgetForProject } from "@/lib/reports/project-budget-data"
import { formatCurrency, formatDate } from "@/lib/utils/format"
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

const CATEGORY_LABELS: Record<string, string> = {
  material: "Material",
  labor: "Tenaga Kerja",
  subkontrak: "Subkontrak",
  lain: "Lain-lain",
}

const HISTORY_LABELS: Record<string, string> = {
  rab_contract_snapshot: "Snapshot kontrak dari penawaran",
  rab_contract_manual: "Nilai kontrak manual",
  rab_locked: "RAB dikunci",
  rab_revision_proposed: "Revisi RAB diusulkan",
  rab_revision: "Revisi RAB diterapkan",
  rab_revision_rejected: "Revisi RAB ditolak",
}

function categoryLabel(category: string | null): string {
  if (category === null) return "Tanpa kategori"
  return CATEGORY_LABELS[category] ?? category
}

/**
 * F-2026-10-21-030 (tahap frontend): RAB vs realisasi proyek per tahap.
 *
 * Murni presentasi dari `loadProjectBudgetForProject` (builder
 * `buildProjectBudget`, PR #370): anggaran per tahap + ember belum
 * teralokasi + realisasi total F-029 tampil apa adanya. UI tidak
 * mengagregasi baris mentah dan tidak memecah realisasi per tahap —
 * realisasi per tahap belum ada di kontrak backend (BR-09 ditunda),
 * jadi seluruh realisasi tampil sebagai belum teralokasi.
 */
export function ProjectBudgetCard({ budget }: Readonly<{ budget: ProjectBudgetForProject }>) {
  const isEmpty = budget.totalBudget === 0 && budget.contractAmount === null && budget.history.length === 0
  const showUnallocated = budget.unallocatedBudget.total > 0 || budget.unallocatedRealized > 0
  const budgetUsedPercent =
    budget.totalBudget > 0 ? (budget.realizedTotal / budget.totalBudget) * 100 : null

  return (
    <ReportCardShell
      label="RAB vs Realisasi Proyek"
      title="RAB vs Realisasi"
      summary={
        <>
          {budget.isLocked ? `Terkunci · Revisi #${budget.budgetRevisionNo}` : "Belum terkunci"}
          {" · "}Total RAB {formatCurrency(budget.totalBudget)}
        </>
      }
      isEmpty={isEmpty}
      emptyText="Belum ada RAB untuk proyek ini"
    >
      <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
        <div>
          <span className="text-muted-foreground block">Nilai Kontrak (snapshot):</span>
          <span className="font-semibold text-foreground">
            {budget.contractAmount === null ? "Belum ditetapkan" : formatCurrency(budget.contractAmount)}
          </span>
          {budget.contractSource && (
            <span className="text-muted-foreground"> ({budget.contractSource === "quotation" ? "dari penawaran" : "manual"})</span>
          )}
        </div>
        <div>
          <span className="text-muted-foreground block">Margin Rencana (kontrak − RAB):</span>
          <span className="font-semibold text-foreground">
            {budget.marginRencana === null ? "-" : formatCurrency(budget.marginRencana)}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground block">Total RAB:</span>
          <span className="font-semibold text-foreground">{formatCurrency(budget.totalBudget)}</span>
        </div>
        <div>
          <span className="text-muted-foreground block">Realisasi (L/R proyek):</span>
          <span className="font-semibold text-danger">{formatCurrency(budget.realizedTotal)}</span>
        </div>
        <div>
          <span className="text-muted-foreground block">Selisih RAB − Realisasi:</span>
          <span className={`font-semibold ${budget.varianceTotal < 0 ? "text-danger" : "text-foreground"}`}>
            {formatCurrency(budget.varianceTotal)}
          </span>
        </div>
      </div>

      {budget.totalBudget > 0 && (
        <section aria-label="Anggaran vs realisasi per tahap" className="mt-4 border-t border-default/50 pt-3">
          <h3 className="text-sm font-semibold text-foreground">Anggaran vs Realisasi per Tahap</h3>
          <div className="overflow-x-auto">
          <DetailTable>
            <DetailTableHead>
              <DetailTableTh>Tahap / Kategori</DetailTableTh>
              <DetailTableTh align="right">Anggaran</DetailTableTh>
              <DetailTableTh align="right">Realisasi</DetailTableTh>
              <DetailTableTh align="right">Selisih</DetailTableTh>
              <DetailTableTh align="right">% Terpakai</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {budget.perStageBudget.map((stage) => (
                <Fragment key={`stage-${stage.projectStageId}`}>
                  <DetailTableRow>
                    <DetailTableTd>{stage.stageName ?? `Tahap #${stage.projectStageId}`}</DetailTableTd>
                    <DetailTableTd align="right">{formatCurrency(stage.total)}</DetailTableTd>
                    <DetailTableTd align="right">-</DetailTableTd>
                    <DetailTableTd align="right">-</DetailTableTd>
                    <DetailTableTd align="right">-</DetailTableTd>
                  </DetailTableRow>
                  {stage.categories.map((cat) => (
                    <DetailTableRow key={`cat-${cat.category ?? "null"}`}>
                      <DetailTableTd className="pl-6 text-muted-foreground">{categoryLabel(cat.category)}</DetailTableTd>
                      <DetailTableTd align="right">{formatCurrency(cat.amount)}</DetailTableTd>
                      <DetailTableTd align="right">-</DetailTableTd>
                      <DetailTableTd align="right">-</DetailTableTd>
                      <DetailTableTd align="right">-</DetailTableTd>
                    </DetailTableRow>
                  ))}
                </Fragment>
              ))}
              {showUnallocated && (
                <Fragment key="unallocated">
                  <DetailTableRow>
                    <DetailTableTd>Belum Teralokasi</DetailTableTd>
                    <DetailTableTd align="right">{formatCurrency(budget.unallocatedBudget.total)}</DetailTableTd>
                    <DetailTableTd align="right">{formatCurrency(budget.unallocatedRealized)}</DetailTableTd>
                    <DetailTableTd align="right">
                      {formatCurrency(budget.unallocatedBudget.total - budget.unallocatedRealized)}
                    </DetailTableTd>
                    <DetailTableTd align="right">
                      {budget.unallocatedBudget.total > 0
                        ? `${((budget.unallocatedRealized / budget.unallocatedBudget.total) * 100).toFixed(1)}%`
                        : "-"}
                    </DetailTableTd>
                  </DetailTableRow>
                  {budget.unallocatedBudget.categories.map((cat) => (
                    <DetailTableRow key={`unalloc-${cat.category ?? "null"}`}>
                      <DetailTableTd className="pl-6 text-muted-foreground">{categoryLabel(cat.category)}</DetailTableTd>
                      <DetailTableTd align="right">{formatCurrency(cat.amount)}</DetailTableTd>
                      <DetailTableTd align="right">-</DetailTableTd>
                      <DetailTableTd align="right">-</DetailTableTd>
                      <DetailTableTd align="right">-</DetailTableTd>
                    </DetailTableRow>
                  ))}
                </Fragment>
              )}
            </DetailTableBody>
            <DetailTableFoot>
              <DetailTableFootRow>
                <DetailTableTd>Total RAB vs Realisasi</DetailTableTd>
                <DetailTableTd align="right">{formatCurrency(budget.totalBudget)}</DetailTableTd>
                <DetailTableTd align="right">{formatCurrency(budget.realizedTotal)}</DetailTableTd>
                <DetailTableTd align="right">{formatCurrency(budget.varianceTotal)}</DetailTableTd>
                <DetailTableTd align="right">
                  {budgetUsedPercent === null ? "-" : `${budgetUsedPercent.toFixed(1)}%`}
                </DetailTableTd>
              </DetailTableFootRow>
            </DetailTableFoot>
          </DetailTable>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Realisasi per tahap belum tersedia — seluruh realisasi {formatCurrency(budget.unallocatedRealized)} tampil sebagai belum teralokasi, tidak dibagi rata ke tahap.
          </p>
        </section>
      )}

      {budget.history.length > 0 && (
        <section aria-label="Riwayat RAB" className="mt-4 border-t border-default/50 pt-3">
          <h3 className="text-sm font-semibold text-foreground">Riwayat RAB</h3>
          <DetailTable>
            <DetailTableHead>
              <DetailTableTh>Peristiwa</DetailTableTh>
              <DetailTableTh>Catatan</DetailTableTh>
              <DetailTableTh>Tanggal</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {budget.history.map((entry, i) => (
                <DetailTableRow key={`${entry.action}-${entry.createdAt.getTime()}-${i}`}>
                  <DetailTableTd>{HISTORY_LABELS[entry.action] ?? entry.action}</DetailTableTd>
                  <DetailTableTd>{entry.notes || "-"}</DetailTableTd>
                  <DetailTableTd>{formatDate(entry.createdAt)}</DetailTableTd>
                </DetailTableRow>
              ))}
            </DetailTableBody>
          </DetailTable>
        </section>
      )}
    </ReportCardShell>
  )
}
