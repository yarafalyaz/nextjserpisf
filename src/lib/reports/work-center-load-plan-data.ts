/**
 * Loader read-only papan beban rencana stasiun kerja (F-2026-10-22-090-S).
 *
 * Query massal saja (tanpa N+1): master WorkCenter, WO aktif + tahap
 * penyusunnya, karyawan penanggung jawab + jadwalnya, jadwal departemen,
 * jadwal perusahaan tak-terikat, Holiday dan DepartmentHoliday pada rentang
 * papan (minggu berjalan + 3 minggu). Agregasi di builder murni
 * `work-center-load-plan.ts`.
 *
 * Jadwal efektif per tahap diresolusi di sini mengikuti rantai
 * daily-attendance.service.ts:19-20,44-46: (a) WorkSchedule aktif karyawan
 * tahap, (b) WorkSchedule aktif departemen karyawan itu, (c) WorkSchedule
 * aktif perusahaan yang tidak terikat karyawan/departemen mana pun — tiap
 * tingkat isActive, urut id asc, pertama. Tanpa rujukan sama sekali:
 * effectiveSchedule null -> kapasitas/persen null di builder (AC-LP-5).
 *
 * Izin: pemanggil WAJIB `requirePermission("view_work_orders")` sebelum
 * memanggil loader ini (pola loader laporan existing; halaman menegakkan di
 * server, tanpa izin papan tertutup — AC-LP-9).
 *
 * Read-only murni: tanpa tulis, tanpa jurnal, tanpa StockMove (AC-LP-10).
 */

import { prisma } from "@/lib/db/prisma"
import { ACTIVE_WORK_ORDER_STATUSES } from "@/lib/reports/work-order-queue"
import {
  buildWorkCenterLoadPlan,
  mondayOfWeek,
  LOAD_PLAN_OPERATION_STATUSES,
  LOAD_PLAN_WEEK_COUNT,
  type WorkCenterLoadPlan,
  type WorkCenterLoadPlanCenterInput,
  type WorkCenterLoadPlanScheduleInput,
} from "@/lib/reports/work-center-load-plan"

export async function getWorkCenters(): Promise<WorkCenterLoadPlanCenterInput[]> {
  const centers = await prisma.workCenter.findMany({
    select: {
      id: true,
      name: true,
      capacityHoursPerDay: true,
      parallelStations: true,
      isActive: true,
      sortOrder: true,
    },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  })
  return centers.map((center) => ({
    id: center.id,
    name: center.name,
    capacityHoursPerDay: Number(center.capacityHoursPerDay),
    parallelStations: center.parallelStations,
    isActive: center.isActive,
    sortOrder: center.sortOrder,
  }))
}

export async function getWorkCenterLoadPlan(
  now: Date = new Date(),
): Promise<WorkCenterLoadPlan> {
  const rangeStart = mondayOfWeek(now)
  const rangeEnd = new Date(rangeStart)
  rangeEnd.setDate(rangeEnd.getDate() + LOAD_PLAN_WEEK_COUNT * 7)

  const [centers, workOrders, companySchedules, holidays, departmentHolidays] =
    await Promise.all([
      getWorkCenters(),
      prisma.workOrder.findMany({
        where: { status: { in: [...ACTIVE_WORK_ORDER_STATUSES] } },
        select: {
          id: true,
          slug: true,
          documentNo: true,
          status: true,
          endDate: true,
          customer: { select: { name: true } },
          customerVehicle: {
            select: { plateNumber: true, vehicle: { select: { name: true } } },
          },
          operations: {
            where: { status: { in: [...LOAD_PLAN_OPERATION_STATUSES] } },
            select: {
              id: true,
              name: true,
              status: true,
              estimatedHours: true,
              workCenterId: true,
              assignedEmployeeId: true,
              assignedEmployee: { select: { name: true } },
            },
            orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          },
        },
        orderBy: [{ documentNo: "asc" }, { id: "asc" }],
      }),
      prisma.workSchedule.findMany({
        where: { isActive: true, employees: { none: {} }, departments: { none: {} } },
        orderBy: { id: "asc" },
        select: { id: true, workDays: true },
      }),
      prisma.holiday.findMany({
        where: { date: { gte: rangeStart, lt: rangeEnd } },
        select: { date: true },
      }),
      prisma.departmentHoliday.findMany({
        where: { date: { gte: rangeStart, lt: rangeEnd } },
        select: { departmentId: true, date: true },
      }),
    ])

  const employeeIds = [
    ...new Set(
      workOrders.flatMap((wo) =>
        wo.operations
          .map((op) => op.assignedEmployeeId)
          .filter((id): id is number => id != null),
      ),
    ),
  ]

  const employees =
    employeeIds.length > 0
      ? await prisma.employee.findMany({
          where: { id: { in: employeeIds } },
          select: {
            id: true,
            departmentId: true,
            workSchedules: {
              where: { isActive: true },
              orderBy: { id: "asc" },
              select: { id: true, workDays: true },
            },
            department: {
              select: {
                id: true,
                workSchedules: {
                  where: { isActive: true },
                  orderBy: { id: "asc" },
                  select: { id: true, workDays: true },
                },
              },
            },
          },
        })
      : []

  const scheduleByEmployee = new Map<number, WorkCenterLoadPlanScheduleInput | null>()
  for (const employee of employees) {
    const own = employee.workSchedules[0]
    if (own) {
      scheduleByEmployee.set(employee.id, {
        workDays: own.workDays,
        departmentId: employee.departmentId ?? null,
      })
      continue
    }
    const department = employee.department?.workSchedules[0]
    if (department) {
      scheduleByEmployee.set(employee.id, {
        workDays: department.workDays,
        departmentId: employee.department?.id ?? employee.departmentId ?? null,
      })
      continue
    }
    const company = companySchedules[0]
    scheduleByEmployee.set(
      employee.id,
      company ? { workDays: company.workDays, departmentId: null } : null,
    )
  }

  const companyFallback: WorkCenterLoadPlanScheduleInput | null = companySchedules[0]
    ? { workDays: companySchedules[0].workDays, departmentId: null }
    : null

  return buildWorkCenterLoadPlan({
    centers,
    holidays: holidays.map((h) => h.date),
    departmentHolidays,
    now,
    operations: workOrders.flatMap((wo) => {
      const cv = wo.customerVehicle
      const parts = cv
        ? [cv.plateNumber, cv.vehicle?.name].filter(
            (part): part is string => typeof part === "string" && part.length > 0,
          )
        : []
      const vehicleLabel = parts.length
        ? parts.join(" · ")
        : cv
          ? "Kendaraan tanpa plat"
          : null
      return wo.operations.map((op) => ({
        id: op.id,
        workOrderId: wo.id,
        workOrderDocumentNo: wo.documentNo,
        workOrderSlug: wo.slug,
        workOrderStatus: wo.status,
        workOrderEndDate: wo.endDate,
        customerName: wo.customer?.name ?? null,
        vehicleLabel,
        name: op.name,
        status: op.status,
        estimatedHours: op.estimatedHours == null ? null : Number(op.estimatedHours),
        workCenterId: op.workCenterId,
        assignedEmployeeId: op.assignedEmployeeId,
        assignedEmployeeName: op.assignedEmployee?.name ?? null,
        effectiveSchedule:
          op.assignedEmployeeId != null
            ? (scheduleByEmployee.get(op.assignedEmployeeId) ?? companyFallback)
            : companyFallback,
      }))
    }),
  })
}
