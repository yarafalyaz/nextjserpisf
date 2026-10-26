/**
 * Loader read-only rekap beban tiket per penanggung jawab
 * (F-2026-10-25-033-S lapis aman, baca-saja).
 *
 * Delegasi penuh ke loader 032-S (`getCrmTicketQueue`): gerbang izin
 * `view_tickets` fail-closed, satu query massal populasi, dan resolusi
 * nama User di sana (BR-CTB-02 — nol populasi kedua, nol query kedua).
 * Nol mutasi. Tanpa izin baru (BR-CTB-09).
 */

import { getCrmTicketQueue } from "@/lib/reports/crm-ticket-queue-data"
import {
  buildCrmTicketWorkload,
  type CrmTicketWorkload,
} from "@/lib/reports/crm-ticket-workload"

export async function getCrmTicketWorkload(now: Date = new Date()): Promise<CrmTicketWorkload> {
  const queue = await getCrmTicketQueue(now)
  return buildCrmTicketWorkload(queue.rows, now)
}
