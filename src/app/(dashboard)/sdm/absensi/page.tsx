import { MAX_LIST_ROWS } from "@/lib/constants/list-rows";
export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/auth/permissions";
import { getHrScope, hrScopeWhere, canSearchAcrossEmployees } from "@/lib/auth/hr-scope";
import { AttendanceTable } from "./_components/attendance-table";
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs";
import { SelfAttendanceWidget } from "@/components/attendance/self-attendance-widget";
import { Button } from "@/components/ui/button";
import { AppDatePicker } from "@/components/ui/date-picker";
import { auth } from "@/lib/auth/auth";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Absensi" };

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; cari?: string }>;
}) {
  const user = await requirePermission("view_attendance");

  const params = await searchParams;

  const parsedDate = params.date ? new Date(params.date) : new Date();
  const targetDate = Number.isNaN(parsedDate.getTime())
    ? new Date()
    : parsedDate;
  targetDate.setHours(0, 0, 0, 0);

  const nextDay = new Date(targetDate);
  nextDay.setDate(nextDay.getDate() + 1);

  // Self-service scoping via helper terpusat (karyawan→sendiri,
  // kepala_bengkel→se-departemen, HR/finance/admin/ga→semua).
  const scope = await getHrScope(user);
  // `me` masih diperlukan terpisah untuk flag self-attend (admin yang juga
  // karyawan tetap boleh check-in mandiri), independen dari scope tabel.
  const session = await auth();
  const me = session?.user?.id
    ? await prisma.employee.findFirst({
        where: { userId: Number(session.user.id) },
        select: { id: true },
      })
    : null;
  // Only employees linked to a user account can self-attend.
  const canSelfAttend = me != null;

  const where = {
    date: {
      gte: targetDate,
      lt: nextDay,
    },
    ...hrScopeWhere(scope),
    ...(params.cari &&
      canSearchAcrossEmployees(scope) && {
        employee: { name: { contains: params.cari } },
      }),
  };

  const attendances = await prisma.attendance.findMany({
    where,
    include: { employee: true },
    take: MAX_LIST_ROWS,
    orderBy: { checkIn: "desc" },
  });

  const data = attendances.map((a) => ({
    id: a.id,
    employee: { name: a.employee.name },
    date: a.date.toISOString(),
    checkIn: a.checkIn ? a.checkIn.toISOString() : null,
    checkOut: a.checkOut ? a.checkOut.toISOString() : null,
    status: a.status,
    checkInLatitude: a.checkInLatitude ? Number(a.checkInLatitude) : null,
    checkInLongitude: a.checkInLongitude ? Number(a.checkInLongitude) : null,
    checkOutLatitude: a.checkOutLatitude ? Number(a.checkOutLatitude) : null,
    checkOutLongitude: a.checkOutLongitude ? Number(a.checkOutLongitude) : null,
    overtimeMinutes: a.overtimeMinutes,
    overtimeApproved: a.overtimeApproved,
    lateMinutes: a.lateMinutes ?? null,
  }));

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "SDM", href: "/sdm" },
          { label: "Absensi" },
        ]}
      />

      {/* Self-Service Widget: Check-In / Check-Out (only for linked employees) */}
      {canSelfAttend && <SelfAttendanceWidget />}

      <div className="flex items-center justify-between flex-wrap gap-4">
        <h2 className="text-xl font-bold text-foreground">Riwayat Absensi</h2>
        <form className="flex items-end gap-2" action="/sdm/absensi">
          <AppDatePicker
            name="date"
            defaultValue={targetDate.toISOString().split("T")[0]}
            className="w-44"
          />
          <Button type="submit">Filter</Button>
        </form>
      </div>

      <AttendanceTable data={data} />
    </div>
  );
}
