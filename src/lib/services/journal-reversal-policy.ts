/**
 * Kebijakan "siapa pemilik jurnal" untuk reversal lewat jurnal umum.
 *
 * Putaran 117. Jurnal yang lahir dari alur produksi punya PEMILIK yang
 * bertanggung jawab membalik dan memposting ulang pasangannya:
 *
 * - `ProductionCost` — `onProductionCostAbsorbed` membaca jurnal aktif per
 *   baris biaya untuk menghitung nilai kumulatif, membaliknya, lalu menulis
 *   pengganti di kunci yang sama. Reversal generik membuat aslinya `REVERSED`
 *   sehingga bacaan itu tak menemukan apa pun: nilai kumulatif terbaca 0 dan
 *   hanya delta yang diposting — GL berhenti mencerminkan `totalActualCost`.
 * - `ProductionOrder`/`ProductionOrder_<id>` (penyelesaian), varian biaya,
 *   pengeluaran bahan, dan scrap abnormal — laporan (job order, scrap) hanya
 *   membaca jurnal `POSTED`. Aslinya yang `REVERSED` lenyap dari laporan,
 *   sedangkan jurnal lawannya ber-referenceType `Journal` tidak pernah masuk
 *   filter; stok dan WIP dianggap tidak pernah bergerak padahal dokumennya
 *   tetap hidup.
 *
 * Karena itu jalur generik (`reverseJournal`, izin `post_journals`, tanpa
 * gerbang dokumen) menolaknya dan mengarahkan ke dokumen sumber. Fungsi ini
 * dipakai aksi SEKALIGUS guard statisnya, supaya jenis jurnal produksi baru
 * tidak bisa lolos tanpa didaftarkan.
 */
import { isJobJournalReference } from "@/lib/reports/job-order-journal"
import { PRODUCTION_ORDER_ABNORMAL_SCRAP_JOURNAL_REF_TYPE } from "@/lib/services/stock-journal.service"

/** `true` bila jurnal ini dibalik lewat dokumen sumbernya, bukan jalur umum. */
export function isOwnerManagedJournalReference(referenceType: string | null | undefined): boolean {
  if (!referenceType) return false
  return (
    isJobJournalReference(referenceType) ||
    referenceType === PRODUCTION_ORDER_ABNORMAL_SCRAP_JOURNAL_REF_TYPE
  )
}
