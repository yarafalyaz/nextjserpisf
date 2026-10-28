export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { MaterialIssueForm } from "@/components/forms/material-issue-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import {
  parsePrefillSegments,
  redirectLegacyPrefillQuery,
  resolvePrefillId,
} from "@/lib/utils/prefill-path"
import { filterWorkOrdersWithoutActiveMi } from "@/lib/inventory/material-issue-form-data"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Pengeluaran Material" }

const woHref = (slug: string) => `/inventaris/pengeluaran-material/tambah/perintah-kerja/${slug}`

export default async function CreateMaterialIssuePage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<{ workOrderId?: string }>
}) {
  await requirePermission("create_material_issues")

  const params = await searchParams
  const { segments } = await routeParams
  const seg = parsePrefillSegments(segments, ["perintah-kerja"])

  // Tautan lama `?workOrderId=` → bentuk path `perintah-kerja/<slug>`.
  if (!seg["perintah-kerja"] && params.workOrderId !== undefined) {
    await redirectLegacyPrefillQuery(prisma.workOrder, params.workOrderId, woHref, "/inventaris/pengeluaran-material/tambah")
  }
  const defaultWorkOrderId = seg["perintah-kerja"]
    ? await resolvePrefillId(prisma.workOrder, seg["perintah-kerja"], woHref)
    : undefined

  // Perintah kerja & proyek ikut dimuat: kolom penaut `workOrderId`/`projectId`
  // sudah ada di skema dan formnya sudah punya pilihannya, tetapi halaman ini
  // dulu tidak meneruskan daftarnya sehingga pengeluaran material dari modul
  // Inventaris tidak bisa ditautkan ke sumber pekerjaannya.
  const [warehouses, items, costCenters, allWorkOrders, projects, activeMiLinks] = await Promise.all([
    prisma.warehouse.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.item.findMany({ where: { isActive: true, deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, sku: true, name: true, qtyOnHand: true, cost: true } }),
    prisma.costCenter.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
    prisma.workOrder.findMany({
      where: { status: { in: ["confirmed", "released", "in_progress"] } },
      orderBy: { createdAt: "desc" },
      select: { id: true, documentNo: true },
    }),
    prisma.project.findMany({
      where: { status: "active" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    // WO-BR-004: saring tampilan saja — WO ber-MI aktif (draf/diproses/
    // selesai) disembunyikan dari dropdown. Guard server createMaterialIssue
    // tetap penolak akhir (MI batal tak dihitung, boleh pengganti).
    prisma.materialIssue.findMany({
      where: { workOrderId: { not: null }, status: { in: ["draft", "processing", "completed"] } },
      select: { workOrderId: true, status: true },
    }),
  ])

  // Nama lokal `workOrders` disengaja: penjaga chain-ui-wiring mewajibkan
  // literal `workOrders={workOrders}` di berkas ini.
  const workOrders = filterWorkOrdersWithoutActiveMi(allWorkOrders, activeMiLinks)

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dasbor",href:"/"},{label:"Inventaris",href:"/inventaris"},{label:"Pengeluaran Material",href:"/inventaris/pengeluaran-material"},{label:"Tambah"}]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Buat Pengeluaran Material</h1>
      </div>
      <MaterialIssueForm warehouses={warehouses} defaultWorkOrderId={defaultWorkOrderId} costCenters={JSON.parse(JSON.stringify(costCenters))} items={JSON.parse(JSON.stringify(items))} workOrders={workOrders} projects={projects} />
    </div>
  )
}
