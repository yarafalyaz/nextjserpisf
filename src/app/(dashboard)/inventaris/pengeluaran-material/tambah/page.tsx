export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { MaterialIssueForm } from "@/components/forms/material-issue-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Pengeluaran Material" }

export default async function CreateMaterialIssuePage() {
  await requirePermission("create_material_issues")

  // Perintah kerja & proyek ikut dimuat: kolom penaut `workOrderId`/`projectId`
  // sudah ada di skema dan formnya sudah punya pilihannya, tetapi halaman ini
  // dulu tidak meneruskan daftarnya sehingga pengeluaran material dari modul
  // Inventaris tidak bisa ditautkan ke sumber pekerjaannya.
  const [warehouses, items, costCenters, workOrders, projects] = await Promise.all([
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
  ])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dasbor",href:"/"},{label:"Inventaris",href:"/inventaris"},{label:"Pengeluaran Material",href:"/inventaris/pengeluaran-material"},{label:"Tambah"}]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Buat Pengeluaran Material</h1>
      </div>
      <MaterialIssueForm warehouses={warehouses} costCenters={JSON.parse(JSON.stringify(costCenters))} items={JSON.parse(JSON.stringify(items))} workOrders={workOrders} projects={projects} />
    </div>
  )
}
