// PROJ-BR-004 G4: baris ini `project.items` = baris RAB (estimasi ProjectItem
// qty × cost rencana), BUKAN material fisik terpakai. Label wajib rencana/RAB —
// "terpakai" menyiratkan aktual dan melanggar pemisahan estimasi vs aktual.
// Biaya aktual material hanya dari MaterialIssue completed di builder L/R proyek.
//
// Diekstrak dari halaman detail proyek supaya labelnya bisa dikunci tes regresi
// (temuan QA F-1 PR #1249: mengembalikan label lama membuat 409 tes tetap hijau).
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { EmptyState } from "@/components/ui/empty-state"
import { formatCurrency } from "@/lib/utils/format"

export const PROJECT_RAB_ITEMS_TAB_LABEL = "Rencana Bahan & Komponen (RAB)"
export const PROJECT_RAB_ITEMS_HEADING = "Rencana Bahan & Komponen (RAB)"
export const PROJECT_RAB_ITEMS_NOTICE =
  "Baris rencana (estimasi RAB) — bukan bahan fisik terpakai. Biaya material aktual hanya diakui dari pengeluaran material selesai di Laba Rugi Proyek."

export const PROJECT_RAB_ITEMS_COLUMNS = {
  description: "Deskripsi / Material",
  qty: "Jml Rencana",
  unitCost: "Biaya Satuan Rencana",
  total: "Total Rencana",
} as const

/** Baris RAB dari `project.items`; Decimal dibiarkan `unknown` dan dikonversi di titik render. */
export type ProjectRabItemRow = {
  id: number
  itemId: number | null
  description: string | null
  qty: unknown
  cost: unknown
}

export function ProjectRabItemsTab({ items }: { items: readonly ProjectRabItemRow[] }) {
  return (
    <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
        <h2 className="text-[0.9375rem] font-semibold text-foreground">{PROJECT_RAB_ITEMS_HEADING}</h2>
      </div>
      <div className="p-4 px-5">
        <p className="mb-3 text-xs text-muted-foreground">{PROJECT_RAB_ITEMS_NOTICE}</p>
        {items.length === 0 ? (
          <EmptyState title="Tidak ada item" />
        ) : (
          <DetailTable>
            <DetailTableHead>
              <DetailTableTh>{PROJECT_RAB_ITEMS_COLUMNS.description}</DetailTableTh>
              <DetailTableTh align="right">{PROJECT_RAB_ITEMS_COLUMNS.qty}</DetailTableTh>
              <DetailTableTh align="right">{PROJECT_RAB_ITEMS_COLUMNS.unitCost}</DetailTableTh>
              <DetailTableTh align="right">{PROJECT_RAB_ITEMS_COLUMNS.total}</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {items.map((item) => (
                <DetailTableRow key={item.id}>
                  <DetailTableTd>{item.description || `Item #${item.itemId}`}</DetailTableTd>
                  <DetailTableTd align="right">{Number(item.qty)}</DetailTableTd>
                  <DetailTableTd align="right">{formatCurrency(Number(item.cost))}</DetailTableTd>
                  <DetailTableTd align="right">{formatCurrency(Number(item.qty) * Number(item.cost))}</DetailTableTd>
                </DetailTableRow>
              ))}
            </DetailTableBody>
          </DetailTable>
        )}
      </div>
    </div>
  )
}
