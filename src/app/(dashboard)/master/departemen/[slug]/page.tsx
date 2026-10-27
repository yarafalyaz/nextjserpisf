export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Pencil } from "lucide-react"
import { EmptyState } from "@/components/ui/empty-state"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteDepartment } from "@/actions/master.actions"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DetailCard, DetailField, DetailSection } from "@/components/ui/detail-card"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { CanCreate } from "@/components/auth/can-create"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { entityEditHref, entityHref } from "@/lib/utils/entity-url"
export const metadata: Metadata = { title: "Departemen" }

export default async function DepartmentDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("view_departments")

  const { slug } = await params

  const department = await resolveEntity(
    { segment: slug },
    {
      bySlug: (s) =>
        prisma.department.findFirst({
          where: { slug: s },
          include: {
            positions: true,
            employees: { take: 10, orderBy: { name: "asc" } },
          },
        }),
      byId: (id) =>
        prisma.department.findUnique({
          where: { id },
          include: {
            positions: true,
            employees: { take: 10, orderBy: { name: "asc" } },
          },
        }),
    },
  )

  if (!department) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={department.name}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Data Master", href: "/master" },
          { label: "Departemen", href: "/master/departemen" },
          { label: "Detail" },
        ]}
        actions={
          <>
            <CanCreate permission="edit_departments">
              <Button href={entityEditHref("/master/departemen", department)} variant="secondary"><Pencil size={14} /> Ubah</Button>
            </CanCreate>
            <CanCreate permission="delete_departments">
              <DeleteButton id={department.id} action={deleteDepartment} />
            </CanCreate>
            <BackButton href="/master/departemen" />
          </>
        }
      />

      <DetailCard>
        <DetailField label="Nama" value={department.name} />
        <DetailField label="Kode" value={department.code || "-"} mono />
        <DetailField label="Deskripsi" value={department.description || "-"} colSpan="full" />
        <DetailField label="Dibuat" value={formatDate(department.createdAt)} />
      </DetailCard>

      {/* Positions */}
      <DetailSection title="Posisi">
        {department.positions.length === 0 ? (
          <EmptyState title="Belum ada posisi" />
        ) : (
          <DetailTable>
            <DetailTableHead>
              <DetailTableTh>Nama Posisi</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {department.positions.map((pos) => (
                <DetailTableRow key={pos.id}>
                  <DetailTableTd><Link href={entityHref("/master/jabatan", pos)}>{pos.name}</Link></DetailTableTd>
                </DetailTableRow>
              ))}
            </DetailTableBody>
          </DetailTable>
        )}
      </DetailSection>

      {/* Employees */}
      <DetailSection title="Karyawan">
        {department.employees.length === 0 ? (
          <EmptyState title="Belum ada karyawan" />
        ) : (
          <DetailTable>
            <DetailTableHead>
              <DetailTableTh>No. Karyawan</DetailTableTh>
              <DetailTableTh>Nama</DetailTableTh>
              <DetailTableTh>Email</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {department.employees.map((emp) => (
                <DetailTableRow key={emp.id}>
                  <DetailTableTd className="font-mono"><Link href={entityHref("/master/karyawan", emp)}>{emp.employeeNo}</Link></DetailTableTd>
                  <DetailTableTd>{emp.name}</DetailTableTd>
                  <DetailTableTd>{emp.email || "-"}</DetailTableTd>
                </DetailTableRow>
              ))}
            </DetailTableBody>
          </DetailTable>
        )}
      </DetailSection>
    </div>
  )
}
