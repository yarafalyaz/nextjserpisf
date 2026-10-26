/**
 * Helper loader lead: resolusi nama penanggung massal (tanpa N+1).
 *
 * Dipakai loader lead baca-saja (`lead-expected-close-data.ts`,
 * `lead-priority-data.ts`, dan loader lead berikutnya): satu query
 * `prisma.user.findMany` untuk seluruh `assignedTo` distinct. Leader
 * tanpa penanggung / penanggung tak ditemukan = tidak ada entri
 * (pemanggil memetakan ke null, lalu builder ke label funnel
 * "Belum ditugaskan"). Baca-saja, nol mutasi.
 */

import { prisma } from "@/lib/db/prisma"

export async function resolveLeadAssigneeNames(
  assignedToIds: readonly (number | null)[],
): Promise<Map<number, string>> {
  const ids = Array.from(new Set(assignedToIds.filter((id) => id != null)))
  if (ids.length === 0) return new Map()
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  })
  return new Map(users.map((user) => [user.id, user.name]))
}
