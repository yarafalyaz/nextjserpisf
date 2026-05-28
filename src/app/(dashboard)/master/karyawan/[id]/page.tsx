import { Pencil } from "lucide-react"
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
import { PageHeader, Button, BackButton } from "@/components/ui/page-header"
import { DetailCard, DetailField, DetailSection } from "@/components/ui/detail-card"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("view_employees")
  const { id } = await params
  const numId = Number(id)
  if (!Number.isInteger(numId) || numId <= 0) notFound()

  const employee = await prisma.employee.findUnique({
    where: { id: numId },
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
      <PageHeader
        title={employee.name}
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Master Data", href: "/master" },
          { label: "Employees", href: "/master/karyawan" },
          { label: "Detail" },
        ]}
        actions={
          <>
            <Button href={`/master/karyawan/${id}/ubah`} variant="secondary"><Pencil size={14} /> Edit</Button>
            <DeleteButton id={employee.id} action={deleteEmployee} />
            <BackButton href="/master/karyawan" />
          </>
        }
      />

      <DetailTabs
        ariaLabel="Employee detail tabs"
        tabs={[
          {
            id: "info",
            label: "Info",
            content: (
              <>
                <DetailCard>
                  <DetailField label="NIP" value={employee.employeeNo} mono />
                  <DetailField label="Department" value={employee.department?.name || "-"} />
                  <DetailField label="Posisi" value={employee.position?.name || "-"} />
                  <DetailField label="Email" value={employee.email || "-"} />
                  <DetailField label="Telepon" value={employee.phone || "-"} />
                  <DetailField label="Tanggal Masuk" value={formatDate(employee.joinDate)} />
                  <DetailField label="Gaji Pokok" value={formatCurrency(Number(employee.baseSalary))} />
                  <DetailField label="Status" value={
                    <span className={`status-badge ${employee.isActive ? "status-active" : "status-cancelled"}`}>
                      {employee.isActive ? "Active" : "Inactive"}
                    </span>
                  } />
                </DetailCard>

                {/* Active Loans */}
                {employee.employeeLoans.length > 0 && (
                  <DetailSection title="Pinjaman Aktif">
                    <DetailTable>
                      <DetailTableHead>
                        <DetailTableTh>Jumlah</DetailTableTh>
                        <DetailTableTh>Cicilan</DetailTableTh>
                        <DetailTableTh>Sisa</DetailTableTh>
                        <DetailTableTh>Mulai</DetailTableTh>
                      </DetailTableHead>
                      <DetailTableBody>
                        {employee.employeeLoans.map((loan) => (
                          <DetailTableRow key={loan.id}>
                            <DetailTableTd>{formatCurrency(Number(loan.totalAmount))}</DetailTableTd>
                            <DetailTableTd>{formatCurrency(Number(loan.monthlyInstallment))}</DetailTableTd>
                            <DetailTableTd className="text-danger">{formatCurrency(Number(loan.remainingAmount))}</DetailTableTd>
                            <DetailTableTd>{formatDate(loan.loanDate)}</DetailTableTd>
                          </DetailTableRow>
                        ))}
                      </DetailTableBody>
                    </DetailTable>
                  </DetailSection>
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
                  <Link href={`/sdm/absensis?cari=${employee.name}`} className="text-[0.8125rem] text-primary font-medium hover:underline">Lihat Semua →</Link>
                </div>
                <div className="p-4 px-5">
                  {employee.attendances.length === 0 ? (
                    <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada data absensi</p>
                  ) : (
                    <DetailTable>
                      <DetailTableHead>
                        <DetailTableTh>Tanggal</DetailTableTh>
                        <DetailTableTh>Check In</DetailTableTh>
                        <DetailTableTh>Check Out</DetailTableTh>
                        <DetailTableTh>Status</DetailTableTh>
                      </DetailTableHead>
                      <DetailTableBody>
                        {employee.attendances.map((a) => (
                          <DetailTableRow key={a.id}>
                            <DetailTableTd>{formatDate(a.date)}</DetailTableTd>
                            <DetailTableTd>{a.checkIn ? new Date(a.checkIn).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "-"}</DetailTableTd>
                            <DetailTableTd>{a.checkOut ? new Date(a.checkOut).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "-"}</DetailTableTd>
                            <DetailTableTd><StatusChip status={a.status} /></DetailTableTd>
                          </DetailTableRow>
                        ))}
                      </DetailTableBody>
                    </DetailTable>
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
                  <Link href={`/sdm/permintaan-cuti?cari=${employee.name}`} className="text-[0.8125rem] text-primary font-medium hover:underline">Lihat Semua →</Link>
                </div>
                <div className="p-4 px-5">
                  {employee.leaveRequests.length === 0 ? (
                    <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada data cuti</p>
                  ) : (
                    <DetailTable>
                      <DetailTableHead>
                        <DetailTableTh>Jenis</DetailTableTh>
                        <DetailTableTh>Tanggal Mulai</DetailTableTh>
                        <DetailTableTh>Tanggal Selesai</DetailTableTh>
                        <DetailTableTh>Status</DetailTableTh>
                        <DetailTableTh>Alasan</DetailTableTh>
                      </DetailTableHead>
                      <DetailTableBody>
                        {employee.leaveRequests.map((lr) => (
                          <DetailTableRow key={lr.id}>
                            <DetailTableTd>{lr.type}</DetailTableTd>
                            <DetailTableTd>{formatDate(lr.startDate)}</DetailTableTd>
                            <DetailTableTd>{formatDate(lr.endDate)}</DetailTableTd>
                            <DetailTableTd><StatusChip status={lr.status} /></DetailTableTd>
                            <DetailTableTd>{lr.reason ? (lr.reason.length > 30 ? lr.reason.substring(0, 30) + "..." : lr.reason) : "-"}</DetailTableTd>
                          </DetailTableRow>
                        ))}
                      </DetailTableBody>
                    </DetailTable>
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
                  <Link href={`/sdm/lembur?cari=${employee.name}`} className="text-[0.8125rem] text-primary font-medium hover:underline">Lihat Semua →</Link>
                </div>
                <div className="p-4 px-5">
                  {employee.overtimeRequests.length === 0 ? (
                    <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada data lembur</p>
                  ) : (
                    <DetailTable>
                      <DetailTableHead>
                        <DetailTableTh>Tanggal</DetailTableTh>
                        <DetailTableTh>Jam</DetailTableTh>
                        <DetailTableTh>Status</DetailTableTh>
                        <DetailTableTh>Alasan</DetailTableTh>
                      </DetailTableHead>
                      <DetailTableBody>
                        {employee.overtimeRequests.map((ot) => (
                          <DetailTableRow key={ot.id}>
                            <DetailTableTd>{formatDate(ot.date)}</DetailTableTd>
                            <DetailTableTd>{Number(ot.hours)} jam</DetailTableTd>
                            <DetailTableTd><StatusChip status={ot.status} /></DetailTableTd>
                            <DetailTableTd>{ot.reason ? (ot.reason.length > 30 ? ot.reason.substring(0, 30) + "..." : ot.reason) : "-"}</DetailTableTd>
                          </DetailTableRow>
                        ))}
                      </DetailTableBody>
                    </DetailTable>
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
