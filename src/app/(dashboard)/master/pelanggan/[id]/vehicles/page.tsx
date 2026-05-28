export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { notFound } from "next/navigation"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { StatusChip } from "@/components/ui/status-chip"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteCustomerVehicle } from "@/actions/vehicle.actions"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { Eye, Pencil, Plus } from "lucide-react"

export default async function CustomerVehiclesPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("view_customers")
  const { id } = await params

  const customer = await prisma.customer.findUnique({
    where: { id: Number(id), deletedAt: null },
  })

  if (!customer) notFound()

  const vehicles = await prisma.customerVehicle.findMany({
    where: { customerId: Number(id) },
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
        { label: "Dashboard", href: "/" },
        { label: "Master Data", href: "/master" },
        { label: "Customers", href: "/master/pelanggan" },
        { label: customer.name, href: `/master/customers/${id}` },
        { label: "Kendaraan" },
      ]} />

      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Kendaraan - {customer.name}</h1>
        <div className="flex gap-2">
          <Link href={`/master/customers/${id}/vehicles/create`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">
            <Plus size={14} /> Tambah Kendaraan
          </Link>
          <Link href={`/master/customers/${id}`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-surface-secondary hover:text-foreground transition-all">← Kembali</Link>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-4 px-5">
          {vehicles.length === 0 ? (
            <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada kendaraan terdaftar</p>
          ) : (
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>Plat Nomor</DetailTableTh>
                <DetailTableTh>Brand</DetailTableTh>
                <DetailTableTh>Model</DetailTableTh>
                <DetailTableTh>Tahun</DetailTableTh>
                <DetailTableTh>Warna</DetailTableTh>
                <DetailTableTh>Status</DetailTableTh>
                <DetailTableTh>Aksi</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {vehicles.map((cv) => (
                  <DetailTableRow key={cv.id}>
                    <DetailTableTd className="font-mono">{cv.licensePlate || cv.vehicle?.plateNumber || "-"}</DetailTableTd>
                    <DetailTableTd>{cv.vehicle?.variant?.model?.brand?.name || "-"}</DetailTableTd>
                    <DetailTableTd>{cv.vehicle?.variant?.model?.name || "-"} {cv.vehicle?.variant?.name ? `(${cv.vehicle.variant.name})` : ""}</DetailTableTd>
                    <DetailTableTd>{cv.year || cv.vehicle?.year || "-"}</DetailTableTd>
                    <DetailTableTd>{cv.color || cv.vehicle?.color || "-"}</DetailTableTd>
                    <DetailTableTd><StatusChip status={cv.isActive ? "active" : "inactive"} /></DetailTableTd>
                    <DetailTableTd>
                      <div className="flex items-center gap-1">
                        <Link href={`/master/customers/${id}/vehicles/${cv.id}`} className="p-1.5 rounded-md hover:bg-surface-secondary transition-colors" title="Detail">
                          <Eye size={14} />
                        </Link>
                        <Link href={`/master/customers/${id}/vehicles/${cv.id}/edit`} className="p-1.5 rounded-md hover:bg-surface-secondary transition-colors" title="Edit">
                          <Pencil size={14} />
                        </Link>
                        <DeleteButton id={cv.id} action={deleteCustomerVehicle} />
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
