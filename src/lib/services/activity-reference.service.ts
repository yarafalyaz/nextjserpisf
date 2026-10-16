import { prisma } from "@/lib/db/prisma"
import { ACTIVITY_REFERENCE_FIELDS } from "@/lib/utils/activity-href"

/**
 * Resolusi label entitas untuk `activity logs`.
 *
 * Log menyimpan `modelType` + `modelId` (id mentah), dan deskripsi buatan
 * pemanggil `logActivity()` menyematkan `#id` di dalamnya. Nomor dokumen /
 * kode / nama entitas hanya diketahui DB, jadi dikumpulkan di sini: satu query
 * per model type untuk seluruh baris di halaman, bukan satu query per baris.
 *
 * Pemetaan model→delegate/kolom ada di `lib/utils/activity-href.ts` (data murni)
 * supaya UI bisa memakainya tanpa menarik Prisma ke bundel klien.
 */
type PrismaDelegate = {
  findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>
}

/**
 * Kembalikan peta `"<modelType>:<modelId>"` → label.
 *
 * Entri yang tidak ada di peta berarti labelnya tidak bisa diresolusi — bisa
 * karena modelnya memang tidak dilacak (lihat `isTrackedActivityReference`) atau
 * recordnya sudah dihapus. Pemanggil memakai fallback `#id`.
 */
export async function resolveActivityReferenceLabels(
  refs: Array<{ modelType: string; modelId: number | null }>,
): Promise<Map<string, string>> {
  const idsByType = new Map<string, Set<number>>()
  for (const ref of refs) {
    if (ref.modelId == null || !ACTIVITY_REFERENCE_FIELDS[ref.modelType]) continue
    const set = idsByType.get(ref.modelType) ?? new Set<number>()
    set.add(ref.modelId)
    idsByType.set(ref.modelType, set)
  }

  const labels = new Map<string, string>()
  const client = prisma as unknown as Record<string, PrismaDelegate | undefined>

  await Promise.all(
    [...idsByType.entries()].map(async ([modelType, ids]) => {
      const { delegate, field } = ACTIVITY_REFERENCE_FIELDS[modelType]
      const model = client[delegate]
      if (!model) return
      try {
        const rows = await model.findMany({
          where: { id: { in: [...ids] } },
          select: { id: true, [field]: true },
        })
        for (const row of rows) {
          const value = row[field]
          if (value !== null && value !== undefined && value !== "") {
            labels.set(`${modelType}:${row.id}`, String(value))
          }
        }
      } catch (error) {
        // Pemetaan keliru / kolom tidak ada: jangan gagalkan seluruh halaman log,
        // tetapi jangan diam — kegagalan senyap di sini membuat label hilang tanpa
        // jejak dan sulit dilacak.
        console.warn(
          `[activity-reference] gagal resolve label ${modelType}.${field}:`,
          error instanceof Error ? error.message : error,
        )
      }
    }),
  )

  return labels
}
