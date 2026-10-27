export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { CanCreate } from "@/components/auth/can-create"
import Link from "next/link"
import { EmptyState } from "@/components/ui/empty-state"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { StatusChip } from "@/components/ui/status-chip"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteCustomerVehicle } from "@/actions/vehicle.actions"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { Eye, Pencil, Plus } from "lucide-react"
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

  const vehicles = await prisma.customerVehicle.findMany({
    where: { customerId },
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
            <Link href={`/master/pelanggan/${customerKey}/kendaraan/tambah`} className="inline-flex items-center justify-center gap-1.5 w-full sm:w-auto px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">
              <Plus size={14} /> Tambah Kendaraan
            </Link>
          </CanCreate>
          <Link href={`/master/pelanggan/${customerKey}`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-surface-secondary hover:text-foreground transition-all">← Kembali</Link>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-4 px-5">
          {vehicles.length === 0 ? (
            <EmptyState title="Belum ada kendaraan terdaftar" />
          ) : (
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>Plat Nomor</DetailTableTh>
                <DetailTableTh>Merek</DetailTableTh>
                <DetailTableTh>Model</DetailTableTh>
                <DetailTableTh>Tahun</DetailTableTh>
                <DetailTableTh>Warna</DetailTableTh>
                <DetailTableTh>Status</DetailTableTh>
                <DetailTableTh>Aksi</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {vehicles.map((cv) => (
                  <DetailTableRow key={cv.id}>
                    <DetailTableTd className="font-mono">{cv.plateNumber || "-"}</DetailTableTd>
                    <DetailTableTd>{cv.vehicle?.variant?.model?.brand?.name || "-"}</DetailTableTd>
                    <DetailTableTd>{cv.vehicle?.variant?.model?.name || "-"} {cv.vehicle?.variant?.name ? `(${cv.vehicle.variant.name})` : ""}</DetailTableTd>
                    <DetailTableTd>{cv.vehicle?.year || "-"}</DetailTableTd>
                    <DetailTableTd>{cv.color || "-"}</DetailTableTd>
                    <DetailTableTd><StatusChip status={cv.isActive ? "active" : "inactive"} /></DetailTableTd>
                    <DetailTableTd>
                      <div className="flex items-center gap-1">
                        <Link href={`/master/pelanggan/${customerKey}/kendaraan/${cv.slug ?? cv.id}`} className="p-1.5 rounded-md hover:bg-surface-secondary transition-colors" title="Detail">
                          <Eye size={14} />
                        </Link>
                        <CanCreate permission="edit_customers">
                          <Link href={`/master/pelanggan/${customerKey}/kendaraan/${cv.slug ?? cv.id}/ubah`} className="p-1.5 rounded-md hover:bg-surface-secondary transition-colors" title="Ubah">
                            <Pencil size={14} />
                          </Link>
                        </CanCreate>
                        <CanCreate permission="delete_customers">
                          <DeleteButton id={cv.id} action={deleteCustomerVehicle} />
                        </CanCreate>
                      </div>
                    </DetailTableTd>
                  </DetailTableRow>
                ))}
              </DetailTableBody>
            </DetailTable>
          )}
        </div>
      </div>
    </div>
  )
}
