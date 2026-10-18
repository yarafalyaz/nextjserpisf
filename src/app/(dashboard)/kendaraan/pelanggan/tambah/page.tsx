export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { CustomerVehicleForm } from "@/components/forms/customer-vehicle-form"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Kendaraan Pelanggan" }

/**
 * Standalone "add customer vehicle" page, reachable from the cross-customer
 * registry (/kendaraan/pelanggan). Unlike the per-customer route under
 * /master/pelanggan/[id]/kendaraan/tambah, the owner is NOT pinned here — the
 * form shows a customer picker so a workshop can register a unit without first
 * navigating into the owner's record.
 */
export default async function CreateCustomerVehicleStandalonePage() {
  await requirePermission("create_customers")

  const [brands, customers] = await Promise.all([
    prisma.vehicleBrand.findMany({
      orderBy: { name: "asc" },
      include: {
        models: {
          orderBy: { name: "asc" },
          include: {
            variants: { orderBy: { name: "asc" } },
          },
        },
      },
    }),
    prisma.customer.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Kendaraan", href: "/kendaraan" },
        { label: "Kendaraan Pelanggan", href: "/kendaraan/pelanggan" },
        { label: "Tambah" },
      ]} />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Tambah Kendaraan Pelanggan</h1>
      </div>

      <CustomerVehicleForm
        brands={brands}
        customers={customers}
        redirectTo="/kendaraan/pelanggan"
      />
    </div>
  )
}
