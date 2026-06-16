export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Pencil } from "lucide-react"
import { DeleteButton } from "@/components/ui/delete-button"
import { deletePosition } from "@/actions/master.actions"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DetailCard, DetailField, DetailSection } from "@/components/ui/detail-card"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
export const metadata: Metadata = { title: "Jabatan" }

export default async function PositionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("view_positions")

  const { id } = await params
  const numId = Number(id)
  if (Number.isNaN(numId)) notFound()

  const position = await prisma.position.findUnique({
    where: { id: numId },
    include: {
      department: true,
      employees: { take: 10, orderBy: { name: "asc" } },
    },
  })

  if (!position) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={position.name}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Master Data", href: "/master" },
          { label: "Jabatan", href: "/master/jabatan" },
          { label: "Detail" },
        ]}
        actions={
          <>
            <Button href={`/master/jabatan/${id}/ubah`} variant="secondary"><Pencil size={14} /> Ubah</Button>
            <DeleteButton id={position.id} action={deletePosition} />
            <BackButton href="/master/jabatan" />
          </>
        }
      />

      <DetailCard>
        <DetailField label="Nama Posisi" value={position.name} />
        <DetailField label="Departemen" value={
          position.department ? (
            <Link href={`/master/departemen/${position.department.id}`}>{position.department.name}</Link>
          ) : "-"
        } />
        <DetailField label="Dibuat" value={formatDate(position.createdAt)} />
      </DetailCard>

      {/* Employees */}
      <DetailSection title="Karyawan">
        {position.employees.length === 0 ? (
          <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">Belum ada karyawan</p>
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
                  <DetailTableTd className="font-mono"><Link href={`/master/karyawan/${emp.id}`}>{emp.employeeNo}</Link></DetailTableTd>
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
