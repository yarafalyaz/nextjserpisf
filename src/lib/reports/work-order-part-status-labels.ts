import type { WorkOrderPartStatus } from "./work-order-part-status"

/** Label status part WO — satu sumber untuk kartu status part + panel substitusi. */
export const PART_STATUS_LABEL: Record<WorkOrderPartStatus, string> = {
  menunggu: "Menunggu",
  dipesan: "Dipesan",
  datang: "Datang",
  "terpasang-sebagian": "Terpasang sebagian",
  terpasang: "Terpasang",
  diganti: "Diganti",
  "tak-tertaut": "Jasa — tak-tertaut",
}
