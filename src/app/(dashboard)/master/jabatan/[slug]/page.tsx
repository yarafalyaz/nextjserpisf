export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Pencil } from "lucide-react"
import { EmptyState } from "@/components/ui/empty-state"
import { DeleteButton } from "@/components/ui/delete-button"
import { deletePosition } from "@/actions/master.actions"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DetailCard, DetailField, DetailSection } from "@/components/ui/detail-card"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { CanCreate } from "@/components/auth/can-create"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { entityHref, entityEditHref } from "@/lib/utils/entity-url"
export const metadata: Metadata = { title: "Jabatan" }

export default async function PositionDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("view_positions")

  const { slug } = await params

  const position = await resolveEntity(
    { segment: slug },
    {
      bySlug: (s) =>
        prisma.position.findFirst({
          where: { slug: s },
          include: {
            department: true,
            employees: { take: 10, orderBy: { name: "asc" } },
          },
        }),
      byId: (id) =>
        prisma.position.findUnique({
          where: { id },
          include: {
            department: true,
            employees: { take: 10, orderBy: { name: "asc" } },
          },
        }),
    },
  )

  if (!position) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={position.name}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Data Master", href: "/master" },
          { label: "Jabatan", href: "/master/jabatan" },
          { label: "Detail" },
        ]}
        actions={
          <>
            <CanCreate permission="edit_positions">
              <Button href={entityEditHref("/master/jabatan", position)} variant="secondary"><Pencil size={14} /> Ubah</Button>
            </CanCreate>
            <CanCreate permission="delete_positions">
              <DeleteButton id={position.id} action={deletePosition} />
            </CanCreate>
            <BackButton href="/master/jabatan" />
          </>
        }
      />

      <DetailCard>
        <DetailField label="Nama Posisi" value={position.name} />
        <DetailField label="Departemen" value={
          position.department ? (
            <Link href={entityHref("/master/departemen", position.department)}>{position.department.name}</Link>
          ) : "-"
        } />
        <DetailField label="Dibuat" value={formatDate(position.createdAt)} />
      </DetailCard>

      {/* Employees */}
      <DetailSection title="Karyawan">
        {position.employees.length === 0 ? (
          <EmptyState title="Belum ada karyawan" />
        ) : (
          <DetailTable>
            <DetailTableHead>
              <DetailTableTh>No. Karyawan</DetailTableTh>
              <DetailTableTh>Nama</DetailTableTh>
              <DetailTableTh>Email</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {position.employees.map((emp) => (
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
