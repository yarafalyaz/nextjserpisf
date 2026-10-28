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

function PendingCells() {
  return (
    <>
      <DetailTableTd align="right">-</DetailTableTd>
      <DetailTableTd align="right">-</DetailTableTd>
      <DetailTableTd align="right">-</DetailTableTd>
    </>
  )
}

/** Sel realisasi per tahap: angka builder apa adanya; null/belum teralokasi = "Belum terukur" (BUKAN 0). */
function StageRealizedCells({
  budgetTotal,
  realized,
  hasStageAllocation,
}: Readonly<{ budgetTotal: number | null; realized: number | null; hasStageAllocation: boolean }>) {
  if (realized === null || !hasStageAllocation) {
    return (
      <>
        <DetailTableTd align="right">Belum terukur</DetailTableTd>
        <DetailTableTd align="right">-</DetailTableTd>
        <DetailTableTd align="right">-</DetailTableTd>
      </>
    )
  }
  return (
    <>
      <DetailTableTd align="right">{formatCurrency(realized)}</DetailTableTd>
      <DetailTableTd align="right">
        {budgetTotal === null ? "-" : formatCurrency(budgetTotal - realized)}
      </DetailTableTd>
      <DetailTableTd align="right">
        {budgetTotal === null || budgetTotal <= 0 ? "-" : `${((realized / budgetTotal) * 100).toFixed(1)}%`}
      </DetailTableTd>
    </>
  )
}

/**
 * F-2026-10-21-030 (tahap frontend): RAB vs realisasi proyek per tahap.
 *
 * Murni presentasi dari `loadProjectBudgetForProject` (builder
 * `buildProjectBudget`, PR #370 + kontrak perStageRealized PR #429):
 * anggaran per tahap + ember belum teralokasi + realisasi total F-029
 * tampil apa adanya. UI tidak mengagregasi baris mentah. Realisasi per
 * tahap dari `perStageRealized`: null/belum teralokasi tampil
 * "Belum terukur" (BUKAN 0); seluruh realisasi tampil belum teralokasi.
 *
 * AC-PROJ-003 (t_9b516ac7): seksi estimasi vs aktual WAJIB berlabel
 * eksplisit — "Estimasi (RAB)" untuk rencana, "Aktual (terealisasi)"
 * untuk biaya dari builder L/R. "Belum terukur" = kolom tahap sumber
 * biaya belum ada di schema (MaterialIssue/Expense hanya projectId,
 * ProductionCost tanpa project/stage) — BUKAN nol, BUKAN alokasi UI.
 */
export function ProjectBudgetCard({ budget }: Readonly<{ budget: ProjectBudgetForProject }>) {
  const isEmpty = budget.totalBudget === 0 && budget.contractAmount === null && budget.history.length === 0
  const showUnallocated = budget.unallocatedBudget.total > 0 || budget.unallocatedRealized > 0
  const budgetUsedPercent =
    budget.totalBudget > 0 ? (budget.realizedTotal / budget.totalBudget) * 100 : null
  // Gabung SEMUA tahap kontrak builder (perStageRealized, urut sortOrder)
  // dengan anggaran per tahap; tahap tanpa baris RAB anggaran "-".
  const budgetByStageId = new Map(budget.perStageBudget.map((s) => [s.projectStageId, s]))
  const realizedByStageId = new Map(budget.perStageRealized.map((s) => [s.projectStageId, s]))
  const stageRows = [
    ...budget.perStageRealized.map((stage) => ({
      projectStageId: stage.projectStageId,
      stageName: stage.stageName,
      budgetStage: budgetByStageId.get(stage.projectStageId) ?? null,
      realizedStage: stage,
    })),
    ...budget.perStageBudget
      .filter((stage) => !realizedByStageId.has(stage.projectStageId))
      .map((stage) => ({
        projectStageId: stage.projectStageId,
        stageName: stage.stageName,
        budgetStage: stage,
        realizedStage: null,
      })),
  ]

  return (
    <ReportCardShell
      label="RAB vs Realisasi Proyek"
      title="Estimasi vs Aktual Proyek"
      summary={
        <>
          {budget.isLocked ? `Terkunci · Revisi #${budget.budgetRevisionNo}` : "Belum terkunci"}
          {" · "}Total Estimasi (RAB) {formatCurrency(budget.totalBudget)}
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
          <span className="text-muted-foreground block">Margin Rencana (kontrak − estimasi RAB):</span>
          <span className="font-semibold text-foreground">
            {budget.marginRencana === null ? "-" : formatCurrency(budget.marginRencana)}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground block">Total RAB:</span>
          <span className="font-semibold text-foreground">{formatCurrency(budget.totalBudget)}</span>
        </div>
        <div>
          <span className="text-muted-foreground block">Total Aktual (terealisasi L/R proyek):</span>
          <span className="font-semibold text-danger">{formatCurrency(budget.realizedTotal)}</span>
        </div>
        <div>
          <span className="text-muted-foreground block">Selisih Estimasi − Aktual:</span>
          <span className={`font-semibold ${budget.varianceTotal < 0 ? "text-danger" : "text-foreground"}`}>
            {formatCurrency(budget.varianceTotal)}
          </span>
        </div>
      </div>

      {budget.totalBudget > 0 && (
        <section aria-label="Estimasi vs aktual per tahap" className="mt-4 border-t border-default/50 pt-3">
          <h3 className="text-sm font-semibold text-foreground">Estimasi vs Aktual per Tahap</h3>
          <div className="overflow-x-auto">
          <DetailTable>
            <DetailTableHead>
              <DetailTableTh>Tahap / Kategori</DetailTableTh>
              <DetailTableTh align="right">Estimasi (RAB)</DetailTableTh>
              <DetailTableTh align="right">Aktual (Terealisasi)</DetailTableTh>
              <DetailTableTh align="right">Selisih</DetailTableTh>
              <DetailTableTh align="right">% Terpakai</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {stageRows.map((row) => (
                <Fragment key={`stage-${row.projectStageId}`}>
                  <DetailTableRow>
                    <DetailTableTd>{row.stageName ?? `Tahap #${row.projectStageId}`}</DetailTableTd>
                    <DetailTableTd align="right">
                      {row.budgetStage === null ? "-" : formatCurrency(row.budgetStage.total)}
                    </DetailTableTd>
                    <StageRealizedCells
                      budgetTotal={row.budgetStage?.total ?? null}
                      realized={row.realizedStage?.realized ?? null}
                      hasStageAllocation={row.realizedStage?.hasStageAllocation ?? false}
                    />
                  </DetailTableRow>
                  {(row.budgetStage?.categories ?? []).map((cat) => (
                    <DetailTableRow key={`cat-${row.projectStageId}-${cat.category ?? "null"}`}>
                      <DetailTableTd className="pl-6 text-muted-foreground">{categoryLabel(cat.category)}</DetailTableTd>
                      <DetailTableTd align="right">{formatCurrency(cat.amount)}</DetailTableTd>
                      <PendingCells />
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
                      <PendingCells />
                    </DetailTableRow>
                  ))}
                </Fragment>
              )}
            </DetailTableBody>
            <DetailTableFoot>
              <DetailTableFootRow>
                <DetailTableTd>Total Estimasi vs Aktual</DetailTableTd>
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
            Aktual per tahap belum terukur — kolom tahap belum ada di sumber biaya (pengeluaran material/beban hanya berkolom proyek, biaya produksi tanpa kolom proyek/tahap), sehingga seluruh aktual {formatCurrency(budget.unallocatedRealized)} tampil sebagai belum teralokasi, tidak dibagi rata ke tahap.
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
