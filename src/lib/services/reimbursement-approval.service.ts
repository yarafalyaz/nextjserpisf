import { prisma } from "@/lib/db/prisma";
import {
  evaluateReimbursementApprovalSod,
  evaluateReimbursementApprovedAmount,
  evaluateReimbursementEvidence,
} from "@/lib/reports/reimbursement";

/**
 * Pengaju klaim reimbursement wajib masih berhak menerima uang perusahaan
 * (hidup + belum berhenti). Create menolak pengaju berhenti (EC-1), tetapi
 * karyawan bisa berhenti/nonaktif/terhapus sesudah klaim lahir — approve
 * dan bayar menilai ulang di dalam tx titik uang bergerak.
 */
export async function assertClaimantPayable(
  client: Pick<typeof prisma, "employee">,
  employeeId: number | null,
): Promise<void> {
  if (employeeId == null) {
    throw new Error("Klaim tidak tertaut ke karyawan pengaju.");
  }
  const claimant = await client.employee.findUnique({
    where: { id: employeeId },
    select: { isActive: true, deletedAt: true, employmentEndedAt: true },
  });
  if (
    !claimant ||
    claimant.deletedAt != null ||
    !claimant.isActive ||
    claimant.employmentEndedAt != null
  ) {
    throw new Error(
      "Klaim tidak dapat diproses: karyawan pengaju sudah nonaktif/berhenti, tolak klaim dan selesaikan lewat jalur berhenti.",
    );
  }
}

export interface ReimbursementGateExpense {
  id: number;
  accountId: number;
  amount: unknown;
  referenceNo: string | null;
  receiptImage: string | null;
  employeeId: number | null;
}

/**
 * Gerbang persetujuan klaim reimbursement (FINHR-8, BR-RB-04, BR-RB-07):
 * - Akun beban harus EXPENSE aktif dan tidak terhapus.
 * - Bukti pengeluaran (lampiran / receiptImage) & referenceNo wajib ada.
 * - Nominal disetujui <= nominal bukti.
 * - Pemisahan tugas (SoD): penyetuju bukan karyawan pengaju.
 */
export async function assertReimbursementApprovalGates(
  client: Pick<typeof prisma, "account" | "transactionAttachment" | "employee">,
  expense: ReimbursementGateExpense,
  approverUserId: number,
): Promise<void> {
  const claimAccount = await client.account.findUnique({
    where: { id: expense.accountId },
    select: { type: true, isActive: true, deletedAt: true },
  });
  if (
    !claimAccount ||
    claimAccount.deletedAt ||
    !claimAccount.isActive ||
    claimAccount.type !== "EXPENSE"
  ) {
    throw new Error(
      "Akun beban klaim belum valid (wajib akun beban EXPENSE aktif), tetapkan akun final sebelum menyetujui.",
    );
  }

  const attachmentCount = await client.transactionAttachment.count({
    where: { referenceType: "expense", referenceId: expense.id },
  });
  const evidence = evaluateReimbursementEvidence({
    referenceNo: expense.referenceNo,
    receiptImage: expense.receiptImage,
    attachmentCount,
  });
  if (!evidence.ok) throw new Error(evidence.error);

  const amountGuard = evaluateReimbursementApprovedAmount({
    submittedAmount: Number(expense.amount),
    evidencedAmount: Number(expense.amount),
  });
  if (!amountGuard.ok) throw new Error(amountGuard.error);

  const approverEmployee = await client.employee.findFirst({
    where: { userId: approverUserId, deletedAt: null },
    select: { id: true },
  });
  const sod = evaluateReimbursementApprovalSod({
    claimantEmployeeId: expense.employeeId,
    approverEmployeeId: approverEmployee?.id ?? null,
  });
  if (!sod.ok) throw new Error(sod.error);
}
