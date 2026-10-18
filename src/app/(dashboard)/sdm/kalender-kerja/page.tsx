export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requireAnyPermission } from "@/lib/auth/permissions"
import { formatDate } from "@/lib/utils/format"
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
import Link from "next/link"
import {
  HolidayForm,
  DepartmentHolidayForm,
  WorkScheduleForm,
} from "./_components/work-calendar-forms"
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

  const [holidays, departmentHolidays, workSchedules, departments] = await Promise.all([
    prisma.holiday.findMany({ orderBy: { date: "desc" }, take: 200 }),
    prisma.departmentHoliday.findMany({
      orderBy: { date: "desc" },
      take: 200,
      include: { department: { select: { name: true } } },
    }),
    prisma.workSchedule.findMany({ orderBy: { name: "asc" }, take: 200 }),
    prisma.department.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ])

  const editHolidayId = Number(params.editHoliday)
  const editingHoliday = holidays.find((h) => h.id === editHolidayId)
  const editDeptHolidayId = Number(params.editDeptHoliday)
  const editingDeptHoliday = departmentHolidays.find((h) => h.id === editDeptHolidayId)
  const editScheduleId = Number(params.editSchedule)
  const editingSchedule = workSchedules.find((s) => s.id === editScheduleId)

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
        </div>
        <HolidayForm
          // `key` wajib: tanpa itu React memakai ulang form yang sudah ter-mount saat
          // berpindah dari "Tambah" ke "Ubah" (navigasi klien `?editHoliday=N`), sehingga
          // `defaultValue` tidak pernah diterapkan lagi — form tampil kosong dan
          // menyimpan akan menimpa data lama dengan nilai kosong.
          key={editingHoliday?.id ?? "baru"}
          holiday={
            editingHoliday
              ? {
                  id: editingHoliday.id,
                  name: editingHoliday.name,
                  date: editingHoliday.date.toISOString(),
                  description: editingHoliday.description,
                }
              : undefined
          }
        />
        <div className="p-4 px-5">
          {holidays.length === 0 ? (
            <p className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
              Belum ada hari libur
            </p>
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
                        <Link
                          href={`/sdm/kalender-kerja?editHoliday=${holiday.id}`}
                          className="text-sm text-primary hover:underline"
                        >
                          Ubah
                        </Link>
                        <DeleteButton id={holiday.id} action={deleteHoliday} />
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
        </div>
        <DepartmentHolidayForm
          // Lihat catatan `key` pada HolidayForm di atas.
          key={editingDeptHoliday?.id ?? "baru"}
          departments={departments}
          item={
            editingDeptHoliday
              ? {
                  id: editingDeptHoliday.id,
                  name: editingDeptHoliday.name,
                  date: editingDeptHoliday.date.toISOString(),
                  departmentId: editingDeptHoliday.departmentId,
                }
              : undefined
          }
        />
        <div className="p-4 px-5">
          {departmentHolidays.length === 0 ? (
            <p className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
              Belum ada hari libur departemen
            </p>
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
                        <Link
                          href={`/sdm/kalender-kerja?editDeptHoliday=${holiday.id}`}
                          className="text-sm text-primary hover:underline"
                        >
                          Ubah
                        </Link>
                        <DeleteButton id={holiday.id} action={deleteDepartmentHoliday} />
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
        </div>
        <WorkScheduleForm
          // Lihat catatan `key` pada HolidayForm di atas.
          key={editingSchedule?.id ?? "baru"}
          schedule={
            editingSchedule
              ? {
                  id: editingSchedule.id,
                  name: editingSchedule.name,
                  workDays: editingSchedule.workDays,
                  startTime: editingSchedule.startTime,
                  endTime: editingSchedule.endTime,
                  isActive: editingSchedule.isActive,
                }
              : undefined
          }
        />
        <div className="p-4 px-5">
          {workSchedules.length === 0 ? (
            <p className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
              Belum ada jadwal kerja
            </p>
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
                        <Link
                          href={`/sdm/kalender-kerja?editSchedule=${schedule.id}`}
                          className="text-sm text-primary hover:underline"
                        >
                          Ubah
                        </Link>
                        <DeleteButton id={schedule.id} action={deleteWorkSchedule} />
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
