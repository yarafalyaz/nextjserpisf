/**
 * F-2026-10-24-096-S — pengelompokan foto progres kendaraan & inspeksi WO.
 * Builder MURNI (tanpa Prisma): kontrak read-model untuk panel Frontend
 * (detail WO + kendaraan pelanggan). Server action / loader di lapisan
 * berikutnya memakai builder ini; UI tidak mengarang tahap/kategori.
 *
 * BR-PHOTO-02: kategori tertutup. Baris lama (photoCategory null) dibaca
 * `other` dan masuk ember "belum berkategori" (BR-PHOTO-09) — tidak
 * ditebak dari nama berkas/tanggal.
 * BR-PHOTO-04/10: builder ini hanya membaca; tidak menyentuh progres,
 * status, biaya, atau jurnal.
 */

export const PHOTO_CATEGORIES = ["intake", "progress", "defect", "handover", "other"] as const
export type PhotoCategory = (typeof PHOTO_CATEGORIES)[number]

export const PHOTO_CATEGORY_LABEL: Record<PhotoCategory, string> = {
  intake: "Kondisi awal (intake)",
  progress: "Progres pengerjaan",
  defect: "Temuan/cacat",
  handover: "Serah terima",
  other: "Belum berkategori",
}

/** Tipe induk sah foto tahap (BR-PHOTO-01): satu induk saja per foto. */
export const PHOTO_PARENT_TYPES = [
  "customer_vehicle",
  "work_order",
  "work_order_operation",
  "project_stage",
  "qc_inspection",
] as const
export type PhotoParentType = (typeof PHOTO_PARENT_TYPES)[number]

export function isPhotoCategory(value: string | null | undefined): value is PhotoCategory {
  return value != null && (PHOTO_CATEGORIES as readonly string[]).includes(value)
}

/** Kategori efektif baris: null/tak dikenal -> `other` (fail-closed BR-PHOTO-02). */
export function effectivePhotoCategory(value: string | null | undefined): PhotoCategory {
  return isPhotoCategory(value) ? value : "other"
}

/** Hanya kategori ini yang boleh ditandai terbit ke pelanggan (BR-PHOTO-08). */
export const PUBLISHABLE_PHOTO_CATEGORIES: readonly PhotoCategory[] = ["intake", "progress", "handover"]

export function isPublishableCategory(category: PhotoCategory): boolean {
  return PUBLISHABLE_PHOTO_CATEGORIES.includes(category)
}

export interface PhotoAttachmentRow {
  id: number
  referenceType: string
  referenceId: number
  originalName: string
  fileUrl: string
  mimeType: string
  photoCategory: string | null
  verifiedBy: number | null
  verifiedAt: Date | null
  publishedBy: number | null
  publishedAt: Date | null
  uploadedBy: number | null
  createdAt: Date
}

export interface PhotoView extends PhotoAttachmentRow {
  category: PhotoCategory
  categoryLabel: string
  isVerified: boolean
  isPublished: boolean
}

export interface PhotoGroup {
  referenceType: string
  referenceId: number
  /** Nama tahap/induk dari loader; null = induk tak dikenal loader. */
  parentLabel: string | null
  photos: PhotoView[]
}

export interface GroupedPhotos {
  groups: PhotoGroup[]
  /** Ember BR-PHOTO-09: foto lama tanpa kategori sah. */
  uncategorized: PhotoView[]
  /** Hanya foto bertanda terbit (BR-PHOTO-08) untuk read-model pelanggan. */
  published: PhotoView[]
  total: number
}

export function toPhotoView(row: PhotoAttachmentRow): PhotoView {
  const category = effectivePhotoCategory(row.photoCategory)
  return {
    ...row,
    category,
    categoryLabel: PHOTO_CATEGORY_LABEL[category],
    isVerified: row.verifiedBy != null && row.verifiedAt != null,
    isPublished: row.publishedBy != null && row.publishedAt != null,
  }
}

/**
 * Kelompokkan foto per induk (referenceType+referenceId), urut kronologis
 * dalam grup. `parentLabels`: kunci `${referenceType}:${referenceId}`.
 */
export function groupPhotosByParent(
  rows: readonly PhotoAttachmentRow[],
  parentLabels: Readonly<Record<string, string>> = {},
): GroupedPhotos {
  const views = rows.map(toPhotoView)
  const byKey = new Map<string, PhotoGroup>()
  for (const view of views) {
    const key = `${view.referenceType}:${view.referenceId}`
    let group = byKey.get(key)
    if (!group) {
      group = {
        referenceType: view.referenceType,
        referenceId: view.referenceId,
        parentLabel: parentLabels[key] ?? null,
        photos: [],
      }
      byKey.set(key, group)
    }
    group.photos.push(view)
  }
  for (const group of byKey.values()) {
    group.photos.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id)
  }
  return {
    groups: [...byKey.values()],
    uncategorized: views.filter((v) => v.category === "other"),
    published: views.filter((v) => v.isPublished && isPublishableCategory(v.category)),
    total: views.length,
  }
}

/**
 * Pasangan before/after satu WO (AC-PHOTO-7): foto intake vs handover.
 * Hanya dari baris yang diberikan loader untuk WO itu — builder tidak
 * memasangkan foto WO lain.
 */
export function pairBeforeAfter(rows: readonly PhotoAttachmentRow[]): {
  before: PhotoView[]
  after: PhotoView[]
  hasHandover: boolean
} {
  const views = rows.map(toPhotoView)
  const before = views.filter((v) => v.category === "intake")
  const after = views.filter((v) => v.category === "handover")
  return { before, after, hasHandover: after.length > 0 }
}
