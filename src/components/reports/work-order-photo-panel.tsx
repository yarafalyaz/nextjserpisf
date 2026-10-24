import type { ReactNode } from "react"
import {
  PHOTO_CATEGORIES,
  PHOTO_CATEGORY_LABEL,
  isPublishableCategory,
  type GroupedPhotos,
  type PhotoCategory,
  type PhotoView,
} from "@/lib/reports/attachment-photo"
import { formatDate } from "@/lib/utils/format"
import { SafeImage } from "@/components/ui/safe-image"
import { ReportCardShell } from "./report-card-shell"

/**
 * F-2026-10-24-096-S — panel foto per tahap (AC-PHOTO-3/5/7).
 * Murni presentasi atas GroupedPhotos loader backend: grup per induk,
 * ember kategori persis PHOTO_CATEGORY_LABEL, ember "Belum berkategori"
 * (BR-PHOTO-09) selalu tampil bila ada foto lama, pasangan before/after
 * dari loader. UI tidak mengelompokkan ulang, tidak menebak kategori,
 * tidak menghitung progres. Slot `actions`/`uploads` dirender pemanggil
 * (komponen client) per izin; server penegak.
 */
export type WorkOrderPhotosData = GroupedPhotos & {
  before: PhotoView[]
  after: PhotoView[]
  hasHandover: boolean
}

function UploadedLabel({ photo }: Readonly<{ photo: PhotoView }>) {
  return (
    <span className="text-xs text-muted-foreground">{formatDate(photo.createdAt)}</span>
  )
}

function PhotoList({
  photos,
  actions,
}: Readonly<{
  photos: PhotoView[]
  actions?: Record<number, ReactNode>
}>) {
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
      {photos.map((photo) => (
        <li key={photo.id} className="flex flex-col gap-2 rounded-lg border border-default p-2">
          {photo.mimeType.startsWith("image/") ? (
            <a
              href={photo.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Buka foto ${photo.originalName} di tab baru`}
              className="block"
            >
              <SafeImage
                src={photo.fileUrl}
                alt=""
                role="presentation"
                width={150}
                height={100}
                className="h-24 w-full rounded object-cover"
              />
            </a>
          ) : (
            <a
              href={photo.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Buka lampiran ${photo.originalName} di tab baru`}
              className="flex h-24 items-center justify-center rounded bg-surface-secondary text-xs font-medium"
            >
              Berkas
            </a>
          )}
          <span className="truncate text-xs font-medium" title={photo.originalName}>
            {photo.originalName}
          </span>
          <span className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="rounded-full border border-default px-2 py-0.5">
              {photo.isVerified ? "Terverifikasi" : "Belum terverifikasi"}
            </span>
            {photo.isPublished ? (
              <span className="rounded-full border border-default px-2 py-0.5">Terbit</span>
            ) : null}
            <UploadedLabel photo={photo} />
          </span>
          {actions?.[photo.id] ?? null}
        </li>
      ))}
    </ul>
  )
}

function CategorySections({
  photos,
  actions,
  headingPrefix,
}: Readonly<{
  photos: PhotoView[]
  actions?: Record<number, ReactNode>
  headingPrefix: string
}>) {
  return (
    <>
      {PHOTO_CATEGORIES.map((category: PhotoCategory) => {
        // Ember `other` dirender terpisah sebagai ember global BR-PHOTO-09.
        if (category === "other") return null
        const inCategory = photos.filter((p) => p.category === category)
        if (inCategory.length === 0) return null
        const label = PHOTO_CATEGORY_LABEL[category]
        return (
          <div key={category} className="flex flex-col gap-2">
            <h4 className="text-sm font-medium text-foreground">
              {headingPrefix} — {label} ({inCategory.length})
            </h4>
            <PhotoList photos={inCategory} actions={actions} />
          </div>
        )
      })}
    </>
  )
}

export function WorkOrderPhotoPanel({
  photos,
  actions,
  uploads,
}: Readonly<{
  photos: WorkOrderPhotosData
  actions?: Record<number, ReactNode>
  uploads?: ReactNode
}>) {
  return (
    <ReportCardShell
      label="Foto per Tahap Perintah Kerja"
      title="Foto per Tahap Perintah Kerja"
      summary={`${photos.total} foto`}
      isEmpty={photos.total === 0}
      emptyText="Belum ada foto untuk perintah kerja ini"
    >
      <div className="flex flex-col gap-6">
        {photos.before.length > 0 || photos.after.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-foreground">
                {PHOTO_CATEGORY_LABEL.intake} — sebelum ({photos.before.length})
              </h3>
              {photos.before.length === 0 ? (
                <p className="text-sm text-muted-foreground">Belum ada foto kondisi awal</p>
              ) : (
                <PhotoList photos={photos.before} actions={actions} />
              )}
            </div>
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-foreground">
                {PHOTO_CATEGORY_LABEL.handover} — sesudah ({photos.after.length})
              </h3>
              {!photos.hasHandover || photos.after.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Belum serah terima — belum ada foto serah terima
                </p>
              ) : (
                <PhotoList photos={photos.after} actions={actions} />
              )}
            </div>
          </div>
        ) : null}

        {photos.groups.map((group) => (
          <div key={`${group.referenceType}:${group.referenceId}`} className="flex flex-col gap-3">
            <h3 className="text-[0.9375rem] font-semibold text-foreground">
              {group.parentLabel ?? `${group.referenceType} #${group.referenceId}`}
            </h3>
            <CategorySections
              photos={group.photos}
              actions={actions}
              headingPrefix={group.parentLabel ?? group.referenceType}
            />
          </div>
        ))}

        <div className="flex flex-col gap-2">
          <h3 className="text-[0.9375rem] font-semibold text-foreground">
            {PHOTO_CATEGORY_LABEL.other} ({photos.uncategorized.length})
          </h3>
          {photos.uncategorized.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada foto belum berkategori</p>
          ) : (
            <PhotoList photos={photos.uncategorized} actions={actions} />
          )}
        </div>

        {uploads ?? null}
      </div>
    </ReportCardShell>
  )
}

export function CustomerVehiclePhotoPanel({
  photos,
  actions,
  uploads,
}: Readonly<{
  photos: GroupedPhotos
  actions?: Record<number, ReactNode>
  uploads?: ReactNode
}>) {
  const group = photos.groups[0]
  return (
    <ReportCardShell
      label="Foto Kendaraan Pelanggan"
      title="Foto Kendaraan"
      summary={`${photos.total} foto`}
      isEmpty={photos.total === 0}
      emptyText="Belum ada foto untuk kendaraan ini"
    >
      <div className="flex flex-col gap-6">
        <CategorySections
          photos={group?.photos ?? []}
          actions={actions}
          headingPrefix="Kendaraan pelanggan"
        />
        <div className="flex flex-col gap-2">
          <h3 className="text-[0.9375rem] font-semibold text-foreground">
            {PHOTO_CATEGORY_LABEL.other} ({photos.uncategorized.length})
          </h3>
          {photos.uncategorized.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada foto belum berkategori</p>
          ) : (
            <PhotoList photos={photos.uncategorized} actions={actions} />
          )}
        </div>
        {uploads ?? null}
      </div>
    </ReportCardShell>
  )
}

/** Pemanggil memakai ini untuk memutuskan tombol terbit per foto (BR-PHOTO-08). */
export { isPublishableCategory }
