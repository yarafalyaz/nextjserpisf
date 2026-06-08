import { prisma } from "@/lib/db/prisma"

/**
 * Minimal HRM parity seed (attendance + payroll scenario)
 * Run: npx tsx scripts/seed-hrm-parity-min.ts
 */
async function main() {
  const dept = await prisma.department.upsert({
    where: { id: 9991 },
    update: { name: "HRM Parity Dept" },
    create: { id: 9991, name: "HRM Parity Dept", code: "HRM-PARITY" },
  })

  const emp = await prisma.employee.upsert({
    where: { employeeNo: "EMP-HRM-PARITY-001" },
    update: { name: "Parity Employee", departmentId: dept.id, isActive: true },
    create: {
      employeeNo: "EMP-HRM-PARITY-001",
      name: "Parity Employee",
      departmentId: dept.id,
      joinDate: new Date("2026-01-01T00:00:00.000Z"),
      baseSalary: 10_000_000,
      isActive: true,
    },
  })

  await prisma.workSchedule.upsert({
    where: { id: 9991 },
    update: { startTime: "08:00", endTime: "17:00", workDays: "1", departments: { set: [{ id: dept.id }] }, isActive: true },
    create: {
      id: 9991,
      name: "Parity Monday",
      workDays: "1",
      startTime: "08:00",
      endTime: "17:00",
      lateToleranceMinutes: 0,
      departments: { connect: { id: dept.id } },
      isActive: true,
    },
  })

  const date = new Date("2026-05-25T00:00:00.000Z")
  await prisma.attendance.upsert({
    where: { id: 9991 },
    update: {
      employeeId: emp.id,
      date,
      checkIn: new Date("2026-05-25T01:15:00.000Z"),
      checkOut: new Date("2026-05-25T10:00:00.000Z"),
      status: "late",
      lateMinutes: 15,
    },
    create: {
      id: 9991,
      employeeId: emp.id,
      date,
      checkIn: new Date("2026-05-25T01:15:00.000Z"),
      checkOut: new Date("2026-05-25T10:00:00.000Z"),
      status: "late",
      lateMinutes: 15,
    },
  })

  await prisma.payroll.upsert({
    where: { documentNo: "PAYROLL-PARITY-2026-05" },
    update: {
      employeeId: emp.id,
      period: "2026-05",
      startDate: new Date("2026-05-01T00:00:00.000Z"),
      endDate: new Date("2026-05-31T00:00:00.000Z"),
      baseSalary: 10_000_000,
      overtimeTotal: 0,
      appreciationTotal: 0,
      loanDeduction: 0,
      lateDeduction: 75_000,
      lateMinutes: 15,
      netSalary: 9_925_000,
      totalAmount: 9_925_000,
      status: "draft",
    },
    create: {
      documentNo: "PAYROLL-PARITY-2026-05",
      employeeId: emp.id,
      period: "2026-05",
      startDate: new Date("2026-05-01T00:00:00.000Z"),
      endDate: new Date("2026-05-31T00:00:00.000Z"),
      baseSalary: 10_000_000,
      overtimeTotal: 0,
      appreciationTotal: 0,
      loanDeduction: 0,
      lateDeduction: 75_000,
      lateMinutes: 15,
      netSalary: 9_925_000,
      totalAmount: 9_925_000,
      status: "draft",
    },
  })

  console.log("✅ Minimal HRM parity seed done")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
