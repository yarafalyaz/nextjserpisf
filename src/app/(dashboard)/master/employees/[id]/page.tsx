import { Eye, Pencil } from "lucide-react"
export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { DetailTabs } from "@/components/ui/detail-tabs"
import { StatusChip } from "@/components/ui/status-chip"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteEmployee } from "@/actions/master.actions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("view_employees")
  const { id } = await params

  const employee = await prisma.employee.findUnique({
    where: { id: Number(id) },
    include: {
      department: true,
      position: true,
      attendances: { take: 10, orderBy: { date: "desc" } },
      leaveRequests: { take: 10, orderBy: { createdAt: "desc" } },
      overtimeRequests: { take: 10, orderBy: { date: "desc" } },
      employeeLoans: { where: { status: "active" } },
    },
  })

  if (!employee) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Master Data", href: "/master" },
  { label: "Employees", href: "/master/employees" },
  { label: "Detail" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">{employee.name}</h1>
        <div style={{ display: "flex", gap: "8px" }}>
          <Link href={`/master/employees/${id}/edit`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all"><Pencil size={14} className="inline" /> Edit</Link>
          <DeleteButton id={employee.id} action={deleteEmployee} />
          <Link href="/master/employees" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-surface-secondary hover:text-foreground transition-all">← Kembali</Link>
        </div>
      </div>

      <DetailTabs
        ariaLabel="Employee detail tabs"
        tabs={[
          {
            id: "info",
            label: "Info",
            content: (
              <>
                <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted uppercase tracking-wide">NIP</span>
                      <span className="text-[0.9375rem] text-foreground font-medium font-mono">{employee.employeeNo}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted uppercase tracking-wide">Department</span>
                      <span className="text-[0.9375rem] text-foreground font-medium">{employee.department?.name || "-"}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted uppercase tracking-wide">Posisi</span>
                      <span className="text-[0.9375rem] text-foreground font-medium">{employee.position?.name || "-"}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted uppercase tracking-wide">Email</span>
                      <span className="text-[0.9375rem] text-foreground font-medium">{employee.email || "-"}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted uppercase tracking-wide">Telepon</span>
                      <span className="text-[0.9375rem] text-foreground font-medium">{employee.phone || "-"}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted uppercase tracking-wide">Tanggal Masuk</span>
                      <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(employee.joinDate)}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted uppercase tracking-wide">Gaji Pokok</span>
                      <span className="text-[0.9375rem] text-foreground font-medium">{formatCurrency(Number(employee.baseSalary))}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted uppercase tracking-wide">Status</span>
                      <span className={`status-badge ${employee.isActive ? "status-active" : "status-cancelled"}`}>
                        {employee.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Active Loans */}
                {employee.employeeLoans.length > 0 && (
                  <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between p-4 px-5 border-b border-default">
                      <h2 className="text-[0.9375rem] font-semibold text-foreground">Pinjaman Aktif</h2>
                    </div>
                    <div className="p-4 px-5">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr><th>Jumlah</th><th>Cicilan</th><th>Sisa</th><th>Mulai</th></tr>
                        </thead>
                        <tbody>
                          {employee.employeeLoans.map((loan) => (
                            <tr key={loan.id}>
                              <td>{formatCurrency(Number(loan.amount))}</td>
                              <td>{formatCurrency(Number(loan.installmentAmount))}</td>
                              <td className="text-danger">{formatCurrency(Number(loan.remainingAmount))}</td>
                              <td>{formatDate(loan.startDate)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            ),
          },
          {
            id: "attendance",
            label: `Attendance (${employee.attendances.length})`,
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex items-center justify-between p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Riwayat Kehadiran</h2>
                  <Link href={`/hrm/attendances?search=${employee.name}`} className="text-[0.8125rem] text-primary font-medium hover:underline">Lihat Semua →</Link>
                </div>
                <div className="p-4 px-5">
                  {employee.attendances.length === 0 ? (
                    <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada data absensi</p>
                  ) : (
                    <table className="w-full border-collapse">
                      <thead>
                        <tr><th>Tanggal</th><th>Check In</th><th>Check Out</th><th>Status</th></tr>
                      </thead>
                      <tbody>
                        {employee.attendances.map((a) => (
                          <tr key={a.id}>
                            <td>{formatDate(a.date)}</td>
                            <td>{a.checkIn ? new Date(a.checkIn).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "-"}</td>
                            <td>{a.checkOut ? new Date(a.checkOut).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "-"}</td>
                            <td><StatusChip status={a.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            ),
          },
          {
            id: "leave",
            label: `Leave (${employee.leaveRequests.length})`,
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex items-center justify-between p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Riwayat Cuti</h2>
                  <Link href={`/hrm/leave-requests?search=${employee.name}`} className="text-[0.8125rem] text-primary font-medium hover:underline">Lihat Semua →</Link>
                </div>
                <div className="p-4 px-5">
                  {employee.leaveRequests.length === 0 ? (
                    <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada data cuti</p>
                  ) : (
                    <table className="w-full border-collapse">
                      <thead>
                        <tr><th>Jenis</th><th>Tanggal Mulai</th><th>Tanggal Selesai</th><th>Status</th><th>Alasan</th></tr>
                      </thead>
                      <tbody>
                        {employee.leaveRequests.map((lr) => (
                          <tr key={lr.id}>
                            <td>{lr.type}</td>
                            <td>{formatDate(lr.startDate)}</td>
                            <td>{formatDate(lr.endDate)}</td>
                            <td><StatusChip status={lr.status} /></td>
                            <td>{lr.reason ? (lr.reason.length > 30 ? lr.reason.substring(0, 30) + "..." : lr.reason) : "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            ),
          },
          {
            id: "overtime",
            label: `Overtime (${employee.overtimeRequests.length})`,
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex items-center justify-between p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Riwayat Lembur</h2>
                  <Link href={`/hrm/overtime?search=${employee.name}`} className="text-[0.8125rem] text-primary font-medium hover:underline">Lihat Semua →</Link>
                </div>
                <div className="p-4 px-5">
                  {employee.overtimeRequests.length === 0 ? (
                    <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada data lembur</p>
                  ) : (
                    <table className="w-full border-collapse">
                      <thead>
                        <tr><th>Tanggal</th><th>Jam</th><th>Status</th><th>Alasan</th></tr>
                      </thead>
                      <tbody>
                        {employee.overtimeRequests.map((ot) => (
                          <tr key={ot.id}>
                            <td>{formatDate(ot.date)}</td>
                            <td>{Number(ot.hours)} jam</td>
                            <td><StatusChip status={ot.status} /></td>
                            <td>{ot.reason ? (ot.reason.length > 30 ? ot.reason.substring(0, 30) + "..." : ot.reason) : "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            ),
          },
        ]}
      />
    </div>
  )
}
