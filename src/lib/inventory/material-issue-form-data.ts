/**
 * WO-BR-004 (frontend): saring daftar perintah kerja di form tambah
 * pengeluaran material — WO ber-MI aktif disembunyikan dari dropdown.
 *
 * Guard server (`createMaterialIssue`, inventory.actions.ts) tetap sumber
 * kebenaran: tolak MI kedua per WO bila MI draf/diproses/selesai ada
 * (MI batal tak dihitung). Fungsi ini hanya saring tampilan supaya klik
 * yang pasti ditolak tak muncul; perilaku label/UX dropdown tak berubah.
 */

/** Status MI yang menghalangi WO dipilih di dropdown tambah. */
export const ACTIVE_MATERIAL_ISSUE_STATUSES = ["draft", "processing", "completed"] as const

export interface WorkOrderChoice {
  id: number
  documentNo: string
}

export interface MaterialIssueLink {
  workOrderId: number | null
  status: string
}

/**
 * WO tampil bila tak punya MI aktif. Tanpa daftar MI (loader gagal
 * sebagian) = tampilkan semua: jangan sembunyikan opsi sah karena data
 * penyaring hilang.
 */
export function filterWorkOrdersWithoutActiveMi(
  workOrders: WorkOrderChoice[],
  materialIssues: MaterialIssueLink[] | null | undefined,
): WorkOrderChoice[] {
  if (!materialIssues) return workOrders
  const blocked = new Set(
    materialIssues
      .filter((mi) => mi.workOrderId != null && (ACTIVE_MATERIAL_ISSUE_STATUSES as readonly string[]).includes(mi.status))
      .map((mi) => mi.workOrderId as number),
  )
  // ponytail: Set sederhana cukup; naik ke Map<woId, documentNo> bila butuh
  // tampilkan No MI pemblokir sebagai hint di opsi.
  return workOrders.filter((wo) => !blocked.has(wo.id))
}
