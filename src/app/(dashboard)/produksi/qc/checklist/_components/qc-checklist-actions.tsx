"use client"

import { deleteQcChecklist, releaseQcChecklist } from "@/actions/qc.actions"
import type { QcChecklistRow } from "./qc-checklist-table"
import { DraftReleaseActions } from "@/components/ui/draft-release-actions"

/**
 * Row actions for a QC checklist: view, edit (draft only), release (draft only),
 * delete (draft + unused only). The server enforces the same guards.
 */
export function QcChecklistActions({ checklist }: { checklist: QcChecklistRow }) {
  return (
    <DraftReleaseActions
      entity={checklist}
      basePath="/produksi/qc/checklist"
      permission="manage_qc_checklists"
      releaseAction={releaseQcChecklist}
      deleteAction={deleteQcChecklist}
      releaseErrorFallback="Gagal merilis checklist"
      releaseSuccess="Checklist QC dirilis"
      deleteErrorFallback="Gagal menghapus checklist"
      deleteSuccess="Checklist QC dihapus"
      releaseMenuLabel="Rilis Checklist"
      releaseDialogTitle="Rilis checklist QC ini?"
      releaseDialogBody="Setelah dirilis, checklist dibekukan dan menjadi acuan inspeksi. Perubahan berikutnya harus membuat versi baru."
      deleteDialogTitle="Hapus checklist QC ini?"
      deleteDialogBody="Checklist draft yang dihapus tidak dapat dikembalikan."
    />
  )
}
