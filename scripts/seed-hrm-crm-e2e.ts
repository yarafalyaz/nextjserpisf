import { prisma } from "../src/lib/db/prisma";
import { generateDocumentNumber } from "../src/lib/utils/document-number";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  console.log("=== E2E: HRM + CRM FLOWS ===\n");

  const user = await prisma.user.findFirst({ select: { id: true } });
  const userId = user?.id;

  const customer = await prisma.customer.upsert({
    where: { id: 1 },
    update: {},
    create: { name: "E2E Customer", phone: "081200000001" },
  });

  const employee = await prisma.employee.upsert({
    where: { employeeNo: "E2E-EMP-001" },
    update: { name: "E2E Employee", baseSalary: 5000000, isActive: true },
    create: {
      employeeNo: "E2E-EMP-001",
      name: "E2E Employee",
      email: "employee.e2e@example.test",
      phone: "081200000003",
      joinDate: new Date("2026-01-01"),
      baseSalary: 5000000,
      isActive: true,
    },
  });

  const project = await prisma.project.create({
    data: {
      documentNo: await generateDocumentNumber("PRJ"),
      name: "E2E HRM Project",
      customerId: customer.id,
      status: "active",
      startDate: new Date("2026-05-28"),
      createdBy: userId,
    },
  });

  console.log("Base HRM/CRM data ready ✓");

  // ─── 1. Attendance ──────────────────────────────────────────────────
  const attendance = await prisma.attendance.create({
    data: {
      employeeId: employee.id,
      date: new Date("2026-05-28"),
      checkIn: new Date("2026-05-28T01:05:00.000Z"),
      checkOut: new Date("2026-05-28T10:10:00.000Z"),
      checkInLatitude: -6.2088,
      checkInLongitude: 106.8456,
      checkOutLatitude: -6.2089,
      checkOutLongitude: 106.8457,
      status: "present",
      overtimeMinutes: 70,
      overtimeApproved: true,
      notes: "E2E attendance",
    },
  });
  assert(attendance.status === "present", "Attendance status tidak present");
  assert(attendance.checkOut !== null, "Attendance checkout tidak tersimpan");
  console.log(`1. Attendance: ${attendance.id} ✓ (check-in/out + overtime approved)`);

  // ─── 2. Leave Approval ──────────────────────────────────────────────
  const leave = await prisma.leaveRequest.create({
    data: {
      employeeId: employee.id,
      type: "annual",
      startDate: new Date("2026-06-01"),
      endDate: new Date("2026-06-02"),
      reason: "E2E annual leave",
      status: "pending",
    },
  });
  const approvedLeave = await prisma.leaveRequest.update({
    where: { id: leave.id },
    data: { status: "approved", approvedBy: userId },
  });
  assert(approvedLeave.status === "approved", "Leave request tidak approved");
  console.log(`2. Leave Request: ${approvedLeave.id} ✓ (approved)`);

  // ─── 3. Overtime Approval ───────────────────────────────────────────
  const overtime = await prisma.overtimeRequest.create({
    data: {
      employeeId: employee.id,
      projectId: project.id,
      date: new Date("2026-05-28"),
      hours: 2,
      totalHours: 2,
      mealHours: 0.5,
      billableHours: 1.5,
      calculatedValue: 150000,
      reason: "E2E urgent work",
      status: "pending",
    },
  });
  const approvedOvertime = await prisma.overtimeRequest.update({
    where: { id: overtime.id },
    data: { status: "approved", approvedBy: userId, approvedAt: new Date("2026-05-28T11:00:00.000Z") },
  });
  assert(approvedOvertime.status === "approved", "Overtime request tidak approved");
  console.log(`3. Overtime Request: ${approvedOvertime.id} ✓ (approved)`);

  // ─── 4. Payroll Approval ────────────────────────────────────────────
  const payroll = await prisma.payroll.create({
    data: {
      documentNo: await generateDocumentNumber("PAYROLL"),
      employeeId: employee.id,
      period: "2026-05",
      startDate: new Date("2026-05-01"),
      endDate: new Date("2026-05-31"),
      baseSalary: 5000000,
      allowances: 500000,
      deductions: 100000,
      overtimeTotal: 150000,
      appreciationTotal: 0,
      loanDeduction: 250000,
      lateDeduction: 25000,
      lateMinutes: 5,
      netSalary: 5275000,
      totalAmount: 5275000,
      paymentDate: new Date("2026-05-31"),
      status: "draft",
      createdBy: userId,
    },
  });
  const approvedPayroll = await prisma.payroll.update({
    where: { id: payroll.id },
    data: { status: "approved", approvedBy: userId },
  });
  assert(approvedPayroll.status === "approved", "Payroll tidak approved");
  assert(Number(approvedPayroll.netSalary) === 5275000, "Payroll netSalary tidak sesuai");
  console.log(`4. Payroll: ${approvedPayroll.documentNo} ✓ (approved, net salary verified)`);

  // ─── 5. Loan + Timesheet ────────────────────────────────────────────
  const loan = await prisma.employeeLoan.create({
    data: {
      employeeId: employee.id,
      loanDate: new Date("2026-05-28"),
      totalAmount: 1000000,
      monthlyInstallment: 250000,
      remainingAmount: 1000000,
      status: "active",
      notes: "E2E employee loan",
    },
  });
  const timesheet = await prisma.timesheet.create({
    data: {
      employeeId: employee.id,
      projectId: project.id,
      date: new Date("2026-05-28"),
      startTime: "09:00",
      endTime: "17:00",
      hours: 8,
      description: "E2E project work",
    },
  });
  assert(loan.status === "active", "Employee loan tidak active");
  assert(Number(timesheet.hours) === 8, "Timesheet hours tidak sesuai");
  console.log(`5. Loan + Timesheet: ${loan.id} / ${timesheet.id} ✓`);

  // ─── 6. Lead + Activity ─────────────────────────────────────────────
  const lead = await prisma.lead.create({
    data: {
      leadNumber: await generateDocumentNumber("LEAD", "simple"),
      name: "E2E Lead",
      email: "lead.e2e@example.test",
      phone: "081200000004",
      company: "PT E2E Lead",
      contactName: "Lead Contact",
      industry: "Automotive",
      source: "referral",
      status: "new",
      estimatedValue: 12500000,
      expectedCloseDate: new Date("2026-06-30"),
      assignedTo: userId,
      notes: "E2E lead",
      createdBy: userId,
    },
  });
  const leadActivity = await prisma.leadActivity.create({
    data: {
      leadId: lead.id,
      type: "status_change",
      subject: "Lead qualified",
      oldStatus: "new",
      newStatus: "qualified",
      userId,
      completedAt: new Date("2026-05-28T08:00:00.000Z"),
    },
  });
  const qualifiedLead = await prisma.lead.update({
    where: { id: lead.id },
    data: { status: "qualified" },
  });
  assert(qualifiedLead.status === "qualified", "Lead status tidak qualified");
  assert(leadActivity.newStatus === "qualified", "Lead activity status tidak sesuai");
  console.log(`6. Lead + Activity: ${qualifiedLead.leadNumber} ✓ (qualified)`);

  // ─── 7. CRM Ticket + Comment ────────────────────────────────────────
  const ticket = await prisma.crmTicket.create({
    data: {
      ticketNumber: await generateDocumentNumber("TKT", "simple"),
      subject: "E2E Customer Issue",
      description: "E2E ticket description",
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      type: "support",
      priority: "high",
      assignedTo: userId,
      status: "open",
      createdBy: userId,
      comments: {
        create: [{ body: "Initial E2E response", userId, isInternal: false }],
      },
    },
    include: { comments: true },
  });
  const resolvedTicket = await prisma.crmTicket.update({
    where: { id: ticket.id },
    data: {
      status: "resolved",
      firstResponseAt: new Date("2026-05-28T08:15:00.000Z"),
      resolvedAt: new Date("2026-05-28T09:00:00.000Z"),
      resolutionNotes: "Solved in E2E flow",
    },
  });
  assert(ticket.comments.length === 1, "CRM ticket comment tidak tersimpan");
  assert(resolvedTicket.status === "resolved", "CRM ticket tidak resolved");
  console.log(`7. CRM Ticket: ${resolvedTicket.ticketNumber} ✓ (commented + resolved)`);

  console.log("\n=== HRM + CRM E2E COMPLETE ===");
}

main()
  .catch((error) => {
    console.error("ERROR:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
