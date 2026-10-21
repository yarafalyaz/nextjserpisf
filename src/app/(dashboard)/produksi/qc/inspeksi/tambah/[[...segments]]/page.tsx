export const dynamic = "force-dynamic"

import { redirect } from "next/navigation"
import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { QcInspectionForm } from "../../_components/qc-inspection-form"
import { prisma } from "@/lib/db/prisma"
import {
  parsePrefillSegments,
  resolvePrefillId,
} from "@/lib/utils/prefill-path"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Catat Inspeksi QC" }

const woHref = (slug: string) => `/produksi/qc/inspeksi/tambah/perintah-kerja/${slug}`

export default async function CreateQcInspectionPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<{ inspectionType?: string; referenceType?: string; referenceId?: string }>
}) {
  await requirePermission("manage_qc_inspections")
  const params = await searchParams
  const { segments } = await routeParams
  const seg = parsePrefillSegments(segments, ["perintah-kerja", "tipe"])

  // Tautan lama `?inspectionType=&referenceType=WorkOrder&referenceId=` →
  // segmen `perintah-kerja/<slug>` (+ `tipe/<tipe>`). Referensi non-WO tidak
  // punya bentuk path; query-nya dibuang ke form polos.
  if (!seg["perintah-kerja"] && !seg.tipe) {
    if (params.referenceType === "WorkOrder" && params.referenceId && /^\d+$/.test(params.referenceId)) {
      const wo = await prisma.workOrder.findUnique({
        where: { id: Number(params.referenceId) },
        select: { slug: true },
      })
      if (wo?.slug) {
        redirect(params.inspectionType ? `${woHref(wo.slug)}/tipe/${params.inspectionType}` : woHref(wo.slug))
      }
      redirect("/produksi/qc/inspeksi/tambah")
    }
    if (params.inspectionType) {
      redirect(`/produksi/qc/inspeksi/tambah/tipe/${params.inspectionType}`)
    }
    if (params.referenceType || params.referenceId) {
      redirect("/produksi/qc/inspeksi/tambah")
    }
  }

  const inspectionType = seg.tipe
  const initialReferenceId = seg["perintah-kerja"]
    ? await resolvePrefillId(prisma.workOrder, seg["perintah-kerja"], woHref)
    : undefined
  const referenceType = seg["perintah-kerja"] ? "WorkOrder" : undefined

  const checklists = await prisma.qcChecklist.findMany({
    where: { status: "released", isActive: true },
    select: {
      id: true,
      name: true,
      checklistType: true,
      items: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, itemName: true, method: true, spec: true, isRequired: true },
      },
    },
    orderBy: { name: "asc" },
    take: 500,
  })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Manufaktur", href: "/produksi" },
          { label: "Pengendalian Mutu", href: "/produksi/qc" },
          { label: "Inspeksi", href: "/produksi/qc/inspeksi" },
          { label: "Catat" },
        ]}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Catat Inspeksi QC</h1>
      </div>

      {checklists.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Belum ada checklist yang dirilis. Rilis checklist terlebih dahulu di menu Checklist QC.
        </p>
      ) : (
        <QcInspectionForm
          checklists={checklists}
          initialInspectionType={inspectionType}
          initialReferenceType={referenceType}
          initialReferenceId={initialReferenceId}
        />
      )}
    </div>
  )
}
