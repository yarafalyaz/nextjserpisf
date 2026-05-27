import { prisma } from "../src/lib/db/prisma";
import { calculateLatePenalty } from "../src/lib/services/late-penalty.service";

/**
 * E2E: Telat Absen → Potong Gaji (Late Attendance → Salary Deduction)
 * 
 * Scenario:
 * 1. WorkSchedule: start 08:00, tolerance 15 min (deadline = 08:15)
 * 2. Employee checks in at 08:35 on Day 1 → 20 min late → penalty 20 × 5000 = 100,000
 * 3. Employee checks in at 08:50 on Day 2 → 35 min late → penalty 35 × 5000 = 175,000
 * 4. Employee checks in at 08:10 on Day 3 → on time (within tolerance) → no penalty
 * 5. Total: 55 min late, Rp 275,000 deduction
 */
async function main() {
  console.log("=== E2E: TELAT ABSEN → POTONG GAJI ===\n");

  // Ensure settings have correct penalty values
  const settings = await prisma.systemSetting.findFirst();
  if (!settings) { console.error("No SystemSetting found!"); process.exit(1); }
  
  await prisma.systemSetting.update({
    where: { id: settings.id },
    data: { latePenaltyPerMinute: 5000, maxLatePenaltyMinutes: 120 },
  });
  console.log("Settings: penaltyPerMinute=5000, maxMinutes=120 ✓");

  // Find or create department
  let dept = await prisma.department.findFirst({ where: { name: "Mekanik" } });
  if (!dept) {
    dept = await prisma.department.create({ data: { name: "Mekanik" } });
  }
  console.log("Department:", dept.name, "✓");

  // Find or create employee
  let emp = await prisma.employee.findFirst({ where: { name: "Andi Mekanik" } });
  if (!emp) {
    emp = await prisma.employee.create({
      data: {
        employeeNo: "EMP-LATE-TEST",
        name: "Andi Mekanik",
        departmentId: dept.id,
        joinDate: new Date("2025-01-01"),
        baseSalary: 5000000,
        isActive: true,
      },
    });
  }
  console.log("Employee:", emp.name, "(dept:", dept.name, ") ✓");

  // Create WorkSchedule for Monday (dayOfWeek=1) with tolerance 15 min
  // Clean up old test schedules first
  await prisma.workSchedule.deleteMany({
    where: { departmentId: dept.id, dayOfWeek: { in: [1, 2, 3] } },
  });

  const dayNames = ["Senin", "Selasa", "Rabu"];
  for (let i = 0; i < 3; i++) {
    await prisma.workSchedule.create({
      data: {
        name: `Shift Pagi ${dayNames[i]}`,
        departmentId: dept.id,
        dayOfWeek: i + 1,
        startTime: "08:00",
        endTime: "17:00",
        lateToleranceMinutes: 15,
        isActive: true,
      },
    });
  }
  console.log("WorkSchedule: Mon-Wed 08:00-17:00, tolerance 15 min ✓");

  // Create attendance records
  // Use a Monday, Tuesday, Wednesday in May 2026
  const mon = new Date("2026-05-25"); // Monday
  const tue = new Date("2026-05-26"); // Tuesday
  const wed = new Date("2026-05-27"); // Wednesday

  // Clean old test attendance
  await prisma.attendance.deleteMany({
    where: { employeeId: emp.id, date: { in: [mon, tue, wed] } },
  });

  // Day 1 (Mon): Check in at 08:35 → 20 min late (after 08:15 deadline)
  await prisma.attendance.create({
    data: {
      employeeId: emp.id,
      date: mon,
      checkIn: new Date("2026-05-25T08:35:00"),
      checkOut: new Date("2026-05-25T17:00:00"),
      status: "present",
    },
  });

  // Day 2 (Tue): Check in at 08:50 → 35 min late
  await prisma.attendance.create({
    data: {
      employeeId: emp.id,
      date: tue,
      checkIn: new Date("2026-05-26T08:50:00"),
      checkOut: new Date("2026-05-26T17:05:00"),
      status: "present",
    },
  });

  // Day 3 (Wed): Check in at 08:10 → within tolerance (no penalty)
  await prisma.attendance.create({
    data: {
      employeeId: emp.id,
      date: wed,
      checkIn: new Date("2026-05-27T08:10:00"),
      checkOut: new Date("2026-05-27T17:00:00"),
      status: "present",
    },
  });
  console.log("Attendance seeded: Mon 08:35, Tue 08:50, Wed 08:10 ✓");

  // Run calculateLatePenalty
  console.log("\nCalculating late penalty...");
  const result = await calculateLatePenalty(emp.id, mon, wed);

  console.log("\nResult:");
  console.log("  Total late minutes:", result.totalLateMinutes);
  console.log("  Total penalty: Rp", result.totalPenalty.toLocaleString("id-ID"));
  console.log("  Late days:", result.details.length);
  for (const d of result.details) {
    console.log(`    - ${d.date.toISOString().slice(0,10)}: scheduled ${d.scheduledStart}, checkIn ${d.actualCheckIn.toISOString().slice(11,16)}, late ${d.lateMinutes} min → Rp ${d.penalty.toLocaleString("id-ID")}`);
  }

  // Assertions
  const expectedLateMinutes = 55; // 20 + 35
  const expectedPenalty = 275000; // 55 × 5000
  const expectedLateDays = 2;

  let pass = true;
  if (result.totalLateMinutes !== expectedLateMinutes) {
    console.error(`\n❌ FAIL: totalLateMinutes = ${result.totalLateMinutes}, expected ${expectedLateMinutes}`);
    pass = false;
  }
  if (result.totalPenalty !== expectedPenalty) {
    console.error(`❌ FAIL: totalPenalty = ${result.totalPenalty}, expected ${expectedPenalty}`);
    pass = false;
  }
  if (result.details.length !== expectedLateDays) {
    console.error(`❌ FAIL: lateDays = ${result.details.length}, expected ${expectedLateDays}`);
    pass = false;
  }

  if (pass) {
    console.log("\n✅ ALL ASSERTIONS PASSED");
    console.log("   55 menit telat → Rp 275.000 potong gaji");
  }

  console.log("\n=== TELAT ABSEN E2E COMPLETE ===");
  await prisma.$disconnect();
  process.exit(pass ? 0 : 1);
}

main().catch((e) => { console.error("ERROR:", e); process.exit(1); });
