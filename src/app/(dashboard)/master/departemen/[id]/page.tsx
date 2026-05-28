export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Pencil } from "lucide-react"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteDepartment } from "@/actions/master.actions"
import { PageHeader, Button, BackButton } from "@/components/ui/page-header"
import { DetailCard, DetailField, DetailSection } from "@/components/ui/detail-card"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"

export default async function DepartmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const department = await prisma.department.findUnique({
    where: { id: Number(id) },
    include: {
      positions: true,
      employees: { take: 10, orderBy: { name: "asc" } },
    },
  })

  if (!department) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={department.name}
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Master Data", href: "/master" },
          { label: "Departments", href: "/master/departemen" },
          { label: "Detail" },
        ]}
        actions={
          <>
            <Button href={`/master/departemen/${id}/ubah`} variant="secondary"><Pencil size={14} /> Edit</Button>
            <DeleteButton id={department.id} action={deleteDepartment} />
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
          <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada posisi</p>
        ) : (
          <DetailTable>
            <DetailTableHead>
              <DetailTableTh>Nama Posisi</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {department.positions.map((pos) => (
                <DetailTableRow key={pos.id}>
                  <DetailTableTd><Link href={`/master/jabatan/${pos.id}`}>{pos.name}</Link></DetailTableTd>
                </DetailTableRow>
              ))}
            </DetailTableBody>
          </DetailTable>
        )}
      </DetailSection>

      {/* Employees */}
      <DetailSection title="Karyawan">
        {department.employees.length === 0 ? (
          <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada karyawan</p>
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
