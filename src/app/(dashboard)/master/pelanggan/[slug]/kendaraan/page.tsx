export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { hasPermission, requirePermission } from "@/lib/auth/permissions"
import { CanCreate } from "@/components/auth/can-create"
import Link from "next/link"
import { EmptyState } from "@/components/ui/empty-state"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { CustomerVehiclesTable } from "./_components/customer-vehicles-table"
import { Plus } from "@/components/ui/fontawesome-icons"
import { loadCustomerBySlug } from "./_components/load-customer-vehicle"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Kendaraan" }

export default async function CustomerVehiclesPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("view_customers")
  const { slug } = await params

  const { customer, customerId, customerKey } = await loadCustomerBySlug(slug)

  // Izin dihitung di sini (Server Component) lalu diteruskan sebagai prop:
  // CustomerVehiclesTable adalah Client Component dan tidak boleh mengimpor
  // hasPermission (lihat komentar di komponen itu — pernah mematahkan build).
  const [canEdit, canDelete] = await Promise.all([
    hasPermission("edit_customers"),
    hasPermission("delete_customers"),
  ])

  const vehicles = await prisma.customerVehicle.findMany({
    where: { customerId, deletedAt: null },
    include: {
      vehicle: {
        include: {
          variant: {
            include: {
              model: {
                include: { brand: true },
              },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Data Master", href: "/master" },
        { label: "Pelanggan", href: "/master/pelanggan" },
        { label: customer.name, href: `/master/pelanggan/${customerKey}` },
        { label: "Kendaraan" },
      ]} />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Kendaraan - {customer.name}</h1>
        <div className="flex gap-2">
          <CanCreate permission="create_customers">
            <Link href={`/master/pelanggan/${customerKey}/kendaraan/tambah`} className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-offset-2">
              <Plus size={14} aria-hidden="true" />
              <span>Tambah Kendaraan</span>
            </Link>
          </CanCreate>
          <Link href={`/master/pelanggan/${customerKey}`} className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium border border-border bg-card text-foreground hover:bg-muted transition-colors shadow-2xs cursor-pointer">
            ← Kembali
          </Link>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-4 px-5">
          {vehicles.length === 0 ? (
            <EmptyState title="Belum ada kendaraan terdaftar" />
          ) : (
            <CustomerVehiclesTable
              customerKey={customerKey}
              canEdit={canEdit}
              canDelete={canDelete}
              data={vehicles.map((cv) => ({
                id: cv.id,
                slug: cv.slug,
                plateNumber: cv.plateNumber,
                brandName: cv.vehicle?.variant?.model?.brand?.name ?? null,
                modelName: cv.vehicle?.variant?.model?.name ?? null,
                variantName: cv.vehicle?.variant?.name ?? null,
                year: cv.vehicle?.year ?? null,
                color: cv.color,
                isActive: cv.isActive,
              }))}
            />
          )}
        </div>
      </div>
    </div>
  )
}
