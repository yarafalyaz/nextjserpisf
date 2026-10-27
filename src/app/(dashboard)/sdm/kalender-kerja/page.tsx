export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requireAnyPermission } from "@/lib/auth/permissions"
import { CanCreate } from "@/components/auth/can-create"
import { formatDate } from "@/lib/utils/format"
import { EmptyState } from "@/components/ui/empty-state"
import { PageHeader } from "@/components/ui/page-header"
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
} from "@/components/ui/detail-table"
import { DeleteButton } from "@/components/ui/delete-button"
import { redirect } from "next/navigation"
import Link from "next/link"
import {
  deleteHoliday,
  deleteDepartmentHoliday,
  deleteWorkSchedule,
} from "@/actions/hrm.actions"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Kalender Kerja" }

const DAY_NAMES = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"]

/** "1,2,3,4,5" → "Sen, Sel, Rab, Kam, Jum" (angka hari dari layanan absensi). */
function formatWorkDays(workDays: string): string {
  const days = workDays
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
  if (days.length === 0) return "-"
  return days.map((day) => DAY_NAMES[day]).join(", ")
}

/**
 * Kalender kerja: hari libur (nasional/perusahaan), hari libur per departemen, dan
 * jadwal kerja.
 *
 * Halaman ini SATU-SATUNYA jalur tulis ketiga tabel tersebut. Sebelumnya hanya
 * skrip seed yang bisa mengisinya, padahal perhitungan absensi dan sisa cuti
 * membacanya — jadi absensi dan hari kerja hanya benar pada basis data yang di-seed.
 * Penghapusan massalnya justru sudah ada (`bulk.actions.ts`), sehingga aplikasi bisa
 * menghapus baris yang tidak bisa dibuat.
 */
export default async function WorkCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{
    editHoliday?: string
    editDeptHoliday?: string
    editSchedule?: string
  }>
}) {
  await requireAnyPermission(["view_work_schedules", "edit_holidays", "manage_holidays"])
  const params = await searchParams

  // Tautan lama `?editHoliday=`/`?editDeptHoliday=`/`?editSchedule=`
  // diarahkan ke halaman ubah masing-masing.
  const legacyEdits: Array<[string | undefined, string]> = [
    [params.editHoliday, "libur"],
    [params.editDeptHoliday, "libur-departemen"],
    [params.editSchedule, "jadwal"],
  ]
  for (const [legacyId, segment] of legacyEdits) {
    const id = Number(legacyId)
    if (legacyId && Number.isInteger(id) && id > 0) {
      redirect(`/sdm/kalender-kerja/${segment}/${id}/ubah`)
    }
  }

  const [holidays, departmentHolidays, workSchedules] = await Promise.all([
    prisma.holiday.findMany({ orderBy: { date: "desc" }, take: 200 }),
    prisma.departmentHoliday.findMany({
      orderBy: { date: "desc" },
      take: 200,
      include: { department: { select: { name: true } } },
    }),
    prisma.workSchedule.findMany({ orderBy: { name: "asc" }, take: 200 }),
  ])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Kalender Kerja"
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "SDM", href: "/sdm" },
          { label: "Kalender Kerja" },
        ]}
      />

      {/* Hari libur */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-[0.9375rem] font-semibold text-foreground">Hari Libur</h2>
            <p className="text-xs text-muted-foreground">
              Berlaku untuk seluruh perusahaan dan dipakai perhitungan absensi.
            </p>
          </div>
          <CanCreate permission="create_holidays">
            <Link
              href="/sdm/kalender-kerja/libur/tambah"
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all"
            >
              + Tambah
            </Link>
          </CanCreate>
        </div>
        <div className="p-4 px-5">
          {holidays.length === 0 ? (
            <EmptyState title="Belum ada hari libur" className="py-10" />
          ) : (
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>Tanggal</DetailTableTh>
                <DetailTableTh>Nama</DetailTableTh>
                <DetailTableTh>Keterangan</DetailTableTh>
                <DetailTableTh align="right">Aksi</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {holidays.map((holiday) => (
                  <DetailTableRow key={holiday.id}>
                    <DetailTableTd>{formatDate(holiday.date)}</DetailTableTd>
                    <DetailTableTd className="font-medium">{holiday.name}</DetailTableTd>
                    <DetailTableTd>{holiday.description ?? "-"}</DetailTableTd>
                    <DetailTableTd align="right">
                      <div className="flex items-center justify-end gap-2">
                        <CanCreate permission="edit_holidays">
                          <Link
                            href={`/sdm/kalender-kerja/libur/${holiday.id}/ubah`}
                            className="text-sm text-primary hover:underline"
                          >
                            Ubah
                          </Link>
                        </CanCreate>
                        <CanCreate permission="delete_holidays">
                          <DeleteButton id={holiday.id} action={deleteHoliday} />
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

      {/* Hari libur departemen */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-[0.9375rem] font-semibold text-foreground">
              Hari Libur Departemen
            </h2>
            <p className="text-xs text-muted-foreground">
              Hanya berlaku untuk departemen yang dipilih.
            </p>
          </div>
          <CanCreate permission="create_holidays">
            <Link
              href="/sdm/kalender-kerja/libur-departemen/tambah"
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all"
            >
              + Tambah
            </Link>
          </CanCreate>
        </div>
        <div className="p-4 px-5">
          {departmentHolidays.length === 0 ? (
            <EmptyState title="Belum ada hari libur departemen" className="py-10" />
          ) : (
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>Tanggal</DetailTableTh>
                <DetailTableTh>Departemen</DetailTableTh>
                <DetailTableTh>Nama</DetailTableTh>
                <DetailTableTh align="right">Aksi</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {departmentHolidays.map((holiday) => (
                  <DetailTableRow key={holiday.id}>
                    <DetailTableTd>{formatDate(holiday.date)}</DetailTableTd>
                    <DetailTableTd>{holiday.department?.name ?? "-"}</DetailTableTd>
                    <DetailTableTd className="font-medium">{holiday.name}</DetailTableTd>
                    <DetailTableTd align="right">
                      <div className="flex items-center justify-end gap-2">
                        <CanCreate permission="edit_holidays">
                          <Link
                            href={`/sdm/kalender-kerja/libur-departemen/${holiday.id}/ubah`}
                            className="text-sm text-primary hover:underline"
                          >
                            Ubah
                          </Link>
                        </CanCreate>
                        <CanCreate permission="delete_holidays">
                          <DeleteButton id={holiday.id} action={deleteDepartmentHoliday} />
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

      {/* Jadwal kerja */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-[0.9375rem] font-semibold text-foreground">Jadwal Kerja</h2>
            <p className="text-xs text-muted-foreground">
              Hari kerja di sini yang dibaca perhitungan absensi dan sisa cuti. Bila
              karyawan atau departemen tidak punya jadwal, sistem memakai Senin–Jumat.
            </p>
          </div>
          <CanCreate permission="create_work_schedules">
            <Link
              href="/sdm/kalender-kerja/jadwal/tambah"
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all"
            >
              + Tambah
            </Link>
          </CanCreate>
        </div>
        <div className="p-4 px-5">
          {workSchedules.length === 0 ? (
            <EmptyState title="Belum ada jadwal kerja" className="py-10" />
          ) : (
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>Nama</DetailTableTh>
                <DetailTableTh>Hari Kerja</DetailTableTh>
                <DetailTableTh>Jam</DetailTableTh>
                <DetailTableTh>Status</DetailTableTh>
                <DetailTableTh align="right">Aksi</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {workSchedules.map((schedule) => (
                  <DetailTableRow key={schedule.id}>
                    <DetailTableTd className="font-medium">{schedule.name}</DetailTableTd>
                    <DetailTableTd>{formatWorkDays(schedule.workDays)}</DetailTableTd>
                    <DetailTableTd>
                      {schedule.startTime} – {schedule.endTime}
                    </DetailTableTd>
                    <DetailTableTd>
                      <span
                        className={`status-badge ${schedule.isActive ? "status-active" : "status-cancelled"}`}
                      >
                        {schedule.isActive ? "Aktif" : "Nonaktif"}
                      </span>
                    </DetailTableTd>
                    <DetailTableTd align="right">
                      <div className="flex items-center justify-end gap-2">
                        <CanCreate permission="edit_work_schedules">
                          <Link
                            href={`/sdm/kalender-kerja/jadwal/${schedule.id}/ubah`}
                            className="text-sm text-primary hover:underline"
                          >
                            Ubah
                          </Link>
                        </CanCreate>
                        <CanCreate permission="delete_work_schedules">
                          <DeleteButton id={schedule.id} action={deleteWorkSchedule} />
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
