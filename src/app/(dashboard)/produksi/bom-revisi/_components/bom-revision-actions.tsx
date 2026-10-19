"use client"

import { deleteBomRevision, releaseBomRevision } from "@/actions/manufacturing.actions"
import type { BomRevisionRow } from "./bom-revision-table"
import { DraftReleaseActions } from "@/components/ui/draft-release-actions"

/**
 * Row actions for a BOM revision: view detail, edit (draft only), release
 * (draft only), delete (draft only). The server enforces the same status
 * guards; the UI merely hides actions that would certainly fail.
 */
export function BomRevisionActions({ revision }: { revision: BomRevisionRow }) {
  return (
    <DraftReleaseActions
      entity={revision}
      basePath="/produksi/bom-revisi"
      permission="manage_bom_revisions"
      releaseAction={releaseBomRevision}
      deleteAction={deleteBomRevision}
      releaseErrorFallback="Gagal merilis revisi"
      releaseSuccess="Revisi BOM dirilis"
      deleteErrorFallback="Gagal menghapus revisi"
      deleteSuccess="Revisi BOM dihapus"
      releaseMenuLabel="Rilis Revisi"
      releaseDialogTitle="Rilis revisi BOM ini?"
      releaseDialogBody="Setelah dirilis, revisi menjadi acuan order produksi baru dan tidak dapat diubah. Revisi yang sedang berlaku akan ditandai sebagai digantikan."
      deleteDialogTitle="Hapus revisi BOM ini?"
      deleteDialogBody="Revisi draf yang dihapus tidak dapat dikembalikan."
    />
  )
}
