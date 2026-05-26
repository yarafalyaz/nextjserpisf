export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Pencil } from "lucide-react"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteDepartment } from "@/actions/master.actions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

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
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Master Data", href: "/master" },
  { label: "Departments", href: "/master/departments" },
  { label: "Detail" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">{department.name}</h1>
        <div style={{ display: "flex", gap: "8px" }}>
          <Link href={`/master/departments/${id}/edit`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all"><Pencil size={14} className="inline" /> Edit</Link>
          <DeleteButton id={department.id} action={deleteDepartment} />
          <Link href="/master/departments" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-surface-secondary hover:text-foreground transition-all">← Kembali</Link>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Nama</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{department.name}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Kode</span>
            <span className="text-[0.9375rem] text-foreground font-medium font-mono">{department.code || "-"}</span>
          </div>
          <div className="flex flex-col gap-1" style={{ gridColumn: "1 / -1" }}>
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Deskripsi</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{department.description || "-"}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Dibuat</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(department.createdAt)}</span>
          </div>
        </div>
      </div>

      {/* Positions */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Posisi</h2>
        </div>
        <div className="p-4 px-5">
          {department.positions.length === 0 ? (
            <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada posisi</p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr><th>Nama Posisi</th></tr>
              </thead>
              <tbody>
                {department.positions.map((pos) => (
                  <tr key={pos.id}>
                    <td><Link href={`/master/positions/${pos.id}`}>{pos.name}</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Employees */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Karyawan</h2>
        </div>
        <div className="p-4 px-5">
          {department.employees.length === 0 ? (
            <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada karyawan</p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr><th>No. Karyawan</th><th>Nama</th><th>Email</th></tr>
              </thead>
              <tbody>
                {department.employees.map((emp) => (
                  <tr key={emp.id}>
                    <td className="font-mono"><Link href={`/master/employees/${emp.id}`}>{emp.employeeNo}</Link></td>
                    <td>{emp.name}</td>
                    <td>{emp.email || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
