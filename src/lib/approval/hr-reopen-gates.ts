import type { prisma } from "@/lib/db/prisma";
import { getApprovalDocDelegate } from "@/lib/approval/approval-models";
import { assertLeaveRequestGates, resolveDayKind } from "@/lib/services/leave-quota.service";
import { assertOvertimeWithinWorkdayLimits } from "@/lib/services/overtime-pay.service";

const HR_REOPEN_GATE_TYPES = new Set([
  "LeaveRequest",
  "OvertimeRequest",
  "EmployeeLoan",
]);

/**
 * Putaran 83: dokumen SDM yang ditolak bisa berubah konteks selama menunggu —
 * pengajuan lain menghabiskan jatah/bentrok/cap, atau karyawan dinonaktifkan.
 * Membuka ulang tanpa menilai ulang gerbang domain membangkitkan dokumen yang
 * tidak akan lolos create/edit hari ini dan bisa disetujui menembus gerbang
 * itu. Nilai ulang di bawah kunci baris karyawan (urutan: approvals ->
 * employees, sama seperti penulis SDM mengunci employees di dalam tx-nya).
 */
export async function assertHrReopenGates(
  tx: Pick<typeof prisma, "employee" | "$executeRaw"> & Record<string, unknown>,
  refType: string,
  refId: number,
): Promise<void> {
  if (!HR_REOPEN_GATE_TYPES.has(refType)) return;

  const gateDocModel = getApprovalDocDelegate(tx as never, refType);
  if (!gateDocModel) {
    throw new Error(`Dokumen ${refType} #${refId} tidak didukung.`);
  }
  const gateDoc = await gateDocModel.findUnique({
    where: { id: refId },
    select: {
      employeeId: true,
      ...(refType === "LeaveRequest"
        ? { type: true, startDate: true, endDate: true }
        : refType === "OvertimeRequest"
          ? { date: true, hours: true }
          : {}),
    },
  });
  if (!gateDoc) {
    throw new Error(`Dokumen ${refType} #${refId} tidak ditemukan.`);
  }
  if (typeof tx.$executeRaw === "function") {
    await tx.$executeRaw`SELECT id FROM employees WHERE id = ${gateDoc.employeeId} FOR UPDATE`;
  }
  const live = await tx.employee.findFirst({
    where: { id: gateDoc.employeeId, isActive: true, deletedAt: null },
    select: { id: true },
  });
  if (!live) {
    throw new Error("Karyawan tidak ditemukan atau tidak aktif");
  }
  if (refType === "LeaveRequest") {
    const gateError = await assertLeaveRequestGates(tx as never, {
      employeeId: gateDoc.employeeId,
      type: gateDoc.type,
      startDate: gateDoc.startDate,
      endDate: gateDoc.endDate,
      excludeId: refId,
    });
    if (gateError) throw new Error(gateError);
  } else if (refType === "OvertimeRequest") {
    await assertOvertimeWithinWorkdayLimits(
      tx as never,
      (empId, d) => resolveDayKind(empId, d, tx as never),
      {
        employeeId: gateDoc.employeeId,
        date: gateDoc.date,
        hours: Number(gateDoc.hours),
        excludeId: refId,
      },
    );
  }
}
