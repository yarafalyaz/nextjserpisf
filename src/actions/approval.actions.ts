"use server";

import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/auth/permissions";
import { auth } from "@/lib/auth/auth";
import { onEmployeeLoanDisbursed } from "@/lib/hooks/accounting.hook";
import { onExpenseApprovedSyncPettyCash } from "@/lib/hooks/expense.hook";
import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/services/activity-log.service"
import { assertCSRF } from "@/lib/security/csrf";
import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error";
import { parseFormData } from "@/lib/validations/parse-form";
import {
  approveStepSchema,
  rejectStepSchema,
  createWorkflowSchema,
  updateWorkflowSchema,
  workflowStepsSchema,
} from "@/lib/validations/approval.schemas";
import { safeJsonParse } from "@/lib/utils/safe-parse";
import { APPROVAL_REFERENCE_PERMISSIONS } from "@/lib/auth/approval-permissions";
import { payrollStatutoryGateError } from "@/lib/services/payroll-statutory.service";
import { nextSlug } from "@/lib/utils/slug-db";
import { assertHrEmployeeAccess, getHrScope } from "@/lib/auth/hr-scope";
import { computeOvertimeApprovalValue } from "@/lib/services/overtime-approval.service";

type WorkflowStepInput = {
  name?: string;
  roleId?: number | null;
  userId?: number | null;
  approverType?: string | null;
};

// Tipe yang siklus statusnya dimiliki action dokumennya sendiri
// (Journal: DRAFT→POSTED huruf besar; VendorPayment: draft→completed;
// StockAdjustment: draft→processed, STOK-06). Untuk tipe ini workflow
// hanya menggerbang transisi posting lewat assertApproved di action
// dokumen; menulis status "approved"/"rejected" ke dokumen akan
// merusak kosakata statusnya (adjustment "approved" tidak bisa diproses —
// processStockAdjustment hanya menerima draft).
// R6WN-02: Asset/Project lahir berstatus operasional "active"; menulis
// "approved" mematikan cron depresiasi (hanya memproses active) dan
// helper status proyek. Keduanya gate-only: assertApproved tetap
// menggerbang disposal aset / edit proyek, status dokumen tak disentuh.
const GATE_ONLY_REFERENCE_TYPES = new Set(["Journal", "VendorPayment", "StockAdjustment", "Asset", "Project"]);

// Vonis F-2026-10-25-014-V K4-S2(a): mematikan/menghapus workflow untuk
// tipe gerbang uang WAJIB tercatat eksplisit di activity log — no-op
// requestApprovalIfConfigured tanpa workflow sesudah itu tidak senyap.
// Tetap [Journal, VendorPayment]: StockAdjustment gate-only statusnya,
// bukan gerbang uang (stok), jadi tidak ikut set ini.
const MONEY_GATE_MODEL_TYPES = new Set(["Journal", "VendorPayment"]);

async function logMoneyGateChange(
  action: "deactivate" | "delete" | "retype",
  workflow: { id: number; modelType: string; name: string; newModelType?: string },
): Promise<void> {
  if (!MONEY_GATE_MODEL_TYPES.has(workflow.modelType)) return;
  const detail =
    action === "delete"
      ? "dihapus"
      : action === "deactivate"
        ? "dinonaktifkan"
        : `tipe dokumen diganti ke ${workflow.newModelType}`
  await logActivity(
    action,
    "ApprovalWorkflow",
    workflow.id,
    `Workflow gerbang uang ${workflow.modelType} (${workflow.name}) ${detail} — gerbang persetujuan dokumen uang mati sampai workflow aktif pengganti dibuat`,
    action === "retype"
      ? { modelType: workflow.modelType, newModelType: workflow.newModelType }
      : { modelType: workflow.modelType },
  );
}

const HR_REFERENCE_TYPES = new Set(["Payroll", "EmployeeLoan", "LeaveRequest", "OvertimeRequest"]);
const HR_REFERENCE_MODELS: Record<string, string> = {
  Payroll: "payroll",
  EmployeeLoan: "employeeLoan",
  LeaveRequest: "leaveRequest",
  OvertimeRequest: "overtimeRequest",
};

async function assertHrScopeForApproval(
  tx: any,
  referenceType: string,
  referenceId: number,
  user: { id: string; roles: string[]; permissions?: string[] },
): Promise<void> {
  if (!HR_REFERENCE_TYPES.has(referenceType)) return;
  const modelKey = HR_REFERENCE_MODELS[referenceType];
  const doc = await tx[modelKey]?.findUnique({
    where: { id: referenceId },
    select: { employeeId: true },
  });
  if (!doc) throw new Error("Dokumen tidak ditemukan");
  if (doc.employeeId == null) return;
  const scope = await getHrScope(user);
  await assertHrEmployeeAccess(scope, doc.employeeId);
}

// Klaim atomik status dokumen: hanya pre-state sah boleh flip ke status
// terminal lewat jalur approval generik; count 0 = dokumen sudah terminal
// (paid/active/rejected/paid_off/...) -> tolak, jangan resurrect/flip ulang.
// Payroll: draft->approved | draft/approved->rejected (approvedBy ikut).
// Leave/Overtime: pending->approved|rejected. EmployeeLoan: pending->active
// (pencairan) | pending->rejected — loan active/paid_off/written_off TIDAK
// boleh ditolak/dicairkan ulang dari sini.
const APPROVE_CLAIMS: Record<string, { from: string[]; error: string }> = {
  Payroll: { from: ["draft"], error: "Slip gaji hanya dapat disetujui dari status draft." },
  LeaveRequest: { from: ["pending"], error: "Pengajuan cuti hanya dapat disetujui dari status menunggu." },
  OvertimeRequest: { from: ["pending"], error: "Pengajuan lembur hanya dapat disetujui dari status menunggu." },
  EmployeeLoan: { from: ["pending"], error: "Pinjaman hanya dapat disetujui dari status menunggu." },
};
const REJECT_CLAIMS: Record<string, { from: string[]; error: string }> = {
  Payroll: { from: ["draft", "approved"], error: "Slip gaji hanya dapat ditolak dari status draft atau approved." },
  LeaveRequest: { from: ["pending"], error: "Pengajuan cuti hanya dapat ditolak dari status menunggu." },
  OvertimeRequest: { from: ["pending"], error: "Pengajuan lembur hanya dapat ditolak dari status menunggu." },
  EmployeeLoan: { from: ["pending"], error: "Pinjaman hanya dapat ditolak dari status menunggu." },
};

const APPROVED_BY_MODELS = new Set([
  "PurchaseRequest",
  "PurchaseOrder",
  "VendorBill",
  "LeaveRequest",
  "OvertimeRequest",
  "EmployeeLoan",
]);
const REJECTION_REASON_MODELS = new Set([
  "PurchaseRequest",
  "LeaveRequest",
  "OvertimeRequest",
]);

function assertApprovalPermission(
  user: { roles?: string[]; permissions?: string[]; isActive?: boolean },
  referenceType: string,
): void {
  if (user.isActive === false) throw new Error("Sesi berakhir. Silakan masuk kembali.");
  if (user.roles?.includes("super_admin")) return;
  const permissions = user.permissions ?? [];
  const referencePermission = APPROVAL_REFERENCE_PERMISSIONS[referenceType];
  if (
    !permissions.includes("approve_workflows") &&
    !(referencePermission && permissions.includes(referencePermission))
  ) {
    throw new Error("Anda tidak memiliki izin menyetujui dokumen ini.");
  }
}

/**
 * Parse + Zod-validate the workflow steps JSON blob from formData.
 * Returns `{ steps }` on success or `{ error }` on failure (malformed JSON,
 * oversized blob, roleId not a positive int, name > 255 chars, > 50 steps,
 * etc.). Centralized so create + update share the exact same gate.
 */
function parseWorkflowSteps(
  stepsJson: string | null | undefined,
): { ok: true; steps: WorkflowStepInput[] } | { ok: false; error: string } {
  if (!stepsJson) return { ok: true, steps: [] };
  const raw = safeJsonParse<unknown>(stepsJson);
  if (raw === null) {
    return { ok: false, error: "Validasi gagal: steps: bukan JSON yang valid" };
  }
  const parsed = workflowStepsSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    return { ok: false, error: `Validasi gagal: ${fieldErrors}` };
  }
  return {
    ok: true,
    steps: parsed.data.map((s) => ({
      name: s.name,
      roleId: s.roleId ?? null,
      userId: s.userId ?? null,
      approverType: s.approverType,
    })),
  };
}

// Enforce that the acting user is actually the designated approver for the
// approval's current step. requirePermission("approve_workflows") only gates
// the *capability*; without this, anyone holding it could approve/reject ANY
// step of ANY approval, defeating role/user-scoped multi-level approval.
// super_admin bypasses (consistent with requirePermission). A step with neither
// userId nor roleId (e.g. approverType-only / unrestricted) falls back to the
// permission gate already passed by the caller.
async function assertStepApprover(
  approval: {
    currentStep: number;
    workflow: {
      steps: {
        stepOrder: number;
        roleId: number | null;
        userId: number | null;
      }[];
    };
  },
  user: { id: string | number; roles: string[] },
): Promise<void> {
  if (user.roles.includes("super_admin")) return;
  const stepDef = approval.workflow.steps.find(
    (s) => s.stepOrder === approval.currentStep,
  );
  if (!stepDef) return;
  if (stepDef.userId != null) {
    if (Number(user.id) !== stepDef.userId) {
      throw new Error("Anda bukan approver untuk langkah ini.");
    }
    return;
  }
  if (stepDef.roleId != null) {
    const role = await prisma.role.findUnique({
      where: { id: stepDef.roleId },
      select: { name: true },
    });
    if (!role || !user.roles.includes(role.name)) {
      throw new Error("Anda bukan approver untuk langkah ini.");
    }
  }
}

export async function approveStep(approvalId: number, formData: FormData) {
  try {
    await assertCSRF();
    const session = await auth();
    const user = session?.user;
    if (!user) throw new Error("Sesi berakhir. Silakan masuk kembali.");

    const parsed = parseFormData(approveStepSchema, formData);
    if (!parsed.success) throw new Error(parsed.error);
    const { notes } = parsed.data;

    // Set when this approveStep completes an Expense workflow. The petty-cash
    // sync must run AFTER the transaction commits (the hook manages its own
    // transaction and is idempotent on documentNo), so we capture the id here
    // and run it below rather than nesting it inside this transaction.
    let expenseToSync: number | null = null;
    let approvalSlug: string | null = null;

    // Serialize concurrent approve/reject on the same approval. Without the row
    // lock, a double-clicked button or two concurrent approvers both pass the
    // "pending" check and both run currentStep + 1, silently skipping a level.
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM approvals WHERE id = ${approvalId} FOR UPDATE`;

      const approval = await tx.approval.findUnique({
        where: { id: approvalId },
        include: {
          workflow: { include: { steps: { orderBy: { stepOrder: "asc" } } } },
        },
      });

      if (!approval) throw new Error("Approval tidak ditemukan");
      if (approval.status !== "pending")
        throw new Error("Approval sudah diproses");
      approvalSlug = approval.slug;

      const totalSteps = approval.workflow.steps.length;
      if (
        totalSteps === 0 ||
        !Number.isSafeInteger(approval.currentStep) ||
        approval.currentStep < 1 ||
        approval.currentStep > totalSteps
      ) {
        throw new Error("Langkah approval tidak valid pada alur persetujuan ini");
      }

      assertApprovalPermission(user, approval.referenceType);

      // Only the designated approver for the current step may approve it.
      await assertStepApprover(approval, user);

      // Maker-Checker: prevent approving own request (super_admin bypasses)
      if (!user.roles.includes("super_admin") && approval.requestedBy !== null && approval.requestedBy === Number(user.id)) {
        throw new Error("Maker-Checker Constraint: Anda tidak diperbolehkan menyetujui transaksi yang Anda buat sendiri.");
      }

      await assertHrScopeForApproval(tx, approval.referenceType, approval.referenceId, user);

      // Create history entry
      await tx.approvalHistory.create({
        data: {
          approvalId: approval.id,
          step: approval.currentStep,
          action: "approve",
          userId: session?.user?.id ? Number(session.user.id) : null,
          notes: notes || null,
        },
      });

      // If last step, mark as approved + update source document
      if (approval.currentStep >= totalSteps) {
        // TASK-018 (2): slip gaji yang lolos workflow generik wajib melewati
        // gerbang statutori yang sama dengan approvePayroll — tanpa ini
        // jalur generik membypass pemeriksaan pending-final/legacy/fallback.
        if (approval.referenceType === "Payroll") {
          const slip = await (tx as any).payroll?.findUnique({
            where: { id: approval.referenceId },
            select: { statutorySnapshot: true },
          });
          const gateError = payrollStatutoryGateError(slip?.statutorySnapshot);
          if (gateError) throw new Error(gateError);
        }
        await tx.approval.update({
          where: { id: approval.id },
          data: {
            status: "approved",
            finalApprovedBy: session?.user?.id ? Number(session.user.id) : null,
            completedAt: new Date(),
          },
        });
        const modelKey = approval.referenceType.charAt(0).toLowerCase() + approval.referenceType.slice(1);
        const docModel = (tx as any)[modelKey];
        if (docModel?.update && !GATE_ONLY_REFERENCE_TYPES.has(approval.referenceType)) {
          const docStatus = approval.referenceType === "EmployeeLoan" ? "active" : "approved";
          const approvedBy = session?.user?.id ? Number(session.user.id) : null;
          // HR-BR-005 B4 (§5.2 spec F-2026-10-28-133-S): gerbang status
          // terminal — slip gaji `paid` tidak boleh di-resurrect jadi
          // `approved` lewat jalur approval generik (approvePayroll/
          // markPayrollPaid sendiri sudah draft->approved->paid searah).
          // BUGHUNT round3: klaim sama diperluas ke Leave/Overtime/Loan —
          // pinjaman `active` (sudah cair) tidak boleh dicairkan ulang,
          // cuti/lembur terminal tidak boleh di-flip ulang.
          const claim = APPROVE_CLAIMS[approval.referenceType];
          if (claim) {
            if (approval.referenceType === "OvertimeRequest") {
              // Lembur: klaim atomik + hitung calculatedValue dalam satu
              // updateMany (helper bersama approveOvertime) — flip polos
              // meninggalkan calculatedValue null, payroll membayar 0.
              const ot = await docModel.findUnique({
                where: { id: approval.referenceId },
                select: {
                  employeeId: true,
                  date: true,
                  hours: true,
                  calculatedValue: true,
                  employee: { select: { baseSalary: true } },
                },
              });
              if (!ot) throw new Error("Dokumen tidak ditemukan");
              if (ot.calculatedValue != null && Number(ot.calculatedValue) > 0) {
                // Sudah terhitung (idempoten): cukup klaim status.
                const claimed = await docModel.updateMany({
                  where: { id: approval.referenceId, status: { in: claim.from } },
                  data: { status: docStatus, approvedBy },
                });
                if (claimed.count === 0) throw new Error(claim.error);
              } else {
                const claimed = await computeOvertimeApprovalValue(
                  tx,
                  { id: approval.referenceId, ...ot },
                  approvedBy ?? 0,
                );
                if (claimed.count === 0) throw new Error(claim.error);
              }
            } else {
              const claimed = await docModel.updateMany({
                where: {
                  id: approval.referenceId,
                  status: claim.from.length === 1 ? claim.from[0] : { in: claim.from },
                },
                data: {
                  status: docStatus,
                  ...(APPROVED_BY_MODELS.has(approval.referenceType) ? { approvedBy } : {}),
                },
              });
              if (claimed.count === 0) throw new Error(claim.error);
            }
          } else {
            await docModel.update({
              where: { id: approval.referenceId },
              data: {
                status: docStatus,
                ...(APPROVED_BY_MODELS.has(approval.referenceType) ? { approvedBy } : {}),
              },
            });
          }
          if (approval.referenceType === "EmployeeLoan") {
            // Hanya jalan sesudah klaim pending->active menang: loan yang
            // sudah active/terminal kalah klaim di atas, jadi jurnal
            // pencairan tidak pernah terbit dua kali dari jalur ini.
            await onEmployeeLoanDisbursed(approval.referenceId, approvedBy ?? undefined, tx);
          }
          if (approval.referenceType === "Expense") {
            // Deferred until after commit (see expenseToSync above).
            expenseToSync = approval.referenceId;
          }
        }
      } else {
        // Advance to next step
        await tx.approval.update({
          where: { id: approval.id },
          data: {
            currentStep: approval.currentStep + 1,
          },
        });
      }
    });

    // Expense workflow just completed: sync the petty cash ledger now that the
    // approval transaction has committed. Without this the expense is "approved"
    // but no petty cash OUT is recorded (understating petty cash) with no retry
    // path via approveExpense, which requires draft/approved. The hook is
    // idempotent on documentNo, so this cannot double-post.
    if (expenseToSync !== null) {
      await onExpenseApprovedSyncPettyCash(
        expenseToSync,
        session?.user?.id ? Number(session.user.id) : undefined,
      );
    }

    await logActivity(
      "approve",
      "Approval",
      approvalId,
      "Menyetujui langkah persetujuan",
    );
    revalidatePath(`/pengaturan/persetujuan/${approvalSlug ?? approvalId}`);
    revalidatePath("/pengaturan/persetujuan");
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[approveStep]", getErrorMessage(e) || e);
    throw e;
  }
}

export async function rejectStep(approvalId: number, formData: FormData) {
  try {
    await assertCSRF();
    const session = await auth();
    const user = session?.user;
    if (!user) throw new Error("Sesi berakhir. Silakan masuk kembali.");

    const parsed = parseFormData(rejectStepSchema, formData);
    if (!parsed.success) throw new Error(parsed.error);
    const { notes } = parsed.data;

    let approvalSlug: string | null = null;

    // Serialize concurrent approve/reject on the same approval (see approveStep).
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM approvals WHERE id = ${approvalId} FOR UPDATE`;

      const approval = await tx.approval.findUnique({
        where: { id: approvalId },
        include: {
          workflow: { include: { steps: { orderBy: { stepOrder: "asc" } } } },
        },
      });

      if (!approval) throw new Error("Approval tidak ditemukan");
      if (approval.status !== "pending")
        throw new Error("Approval sudah diproses");
      approvalSlug = approval.slug;

      const totalSteps = approval.workflow.steps.length;
      if (
        totalSteps === 0 ||
        !Number.isSafeInteger(approval.currentStep) ||
        approval.currentStep < 1 ||
        approval.currentStep > totalSteps
      ) {
        throw new Error("Langkah approval tidak valid pada alur persetujuan ini");
      }

      assertApprovalPermission(user, approval.referenceType);

      // Only the designated approver for the current step may reject it.
      await assertStepApprover(approval, user);

      // Maker-Checker: prevent rejecting own request (super_admin bypasses)
      if (!user.roles.includes("super_admin") && approval.requestedBy !== null && approval.requestedBy === Number(user.id)) {
        throw new Error("Maker-Checker Constraint: Anda tidak diperbolehkan menolak transaksi yang Anda buat sendiri.");
      }

      await assertHrScopeForApproval(tx, approval.referenceType, approval.referenceId, user);

      // Create history entry
      await tx.approvalHistory.create({
        data: {
          approvalId: approval.id,
          step: approval.currentStep,
          action: "reject",
          userId: session?.user?.id ? Number(session.user.id) : null,
          notes: notes || null,
        },
      });

      // Set status to rejected
      await tx.approval.update({
        where: { id: approval.id },
        data: {
          status: "rejected",
          completedAt: new Date(),
        },
      });

      // Update source document status to rejected
      const modelKey = approval.referenceType.charAt(0).toLowerCase() + approval.referenceType.slice(1);
      const docModel = (tx as any)[modelKey];
      if (docModel?.update && !GATE_ONLY_REFERENCE_TYPES.has(approval.referenceType)) {
        const data: Record<string, unknown> = { status: "rejected" };
        if (REJECTION_REASON_MODELS.has(approval.referenceType)) {
          data.rejectionReason = notes || null;
        }
        // Sama seperti approveStep: dokumen terminal tidak boleh ditulis
        // ulang lewat jalur generik — klaim atomik dari pre-state sah saja,
        // count 0 = sudah final -> tolak tanpa resurrect. BUGHUNT round3:
        // pinjaman `active` yang ditolak di sini dulu tetap berstatus
        // rejected walau jurnal pencairan sudah terposting.
        const rejectClaim = REJECT_CLAIMS[approval.referenceType];
        if (rejectClaim) {
          const claimed = await docModel.updateMany({
            where: {
              id: approval.referenceId,
              status: rejectClaim.from.length === 1 ? rejectClaim.from[0] : { in: rejectClaim.from },
            },
            data,
          });
          if (claimed.count === 0) throw new Error(rejectClaim.error);
        } else {
          await docModel.update({
            where: { id: approval.referenceId },
            data,
          });
        }
      }
    });

    await logActivity(
      "reject",
      "Approval",
      approvalId,
      "Menolak langkah persetujuan",
    );
    revalidatePath(`/pengaturan/persetujuan/${approvalSlug ?? approvalId}`);
    revalidatePath("/pengaturan/persetujuan");
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[rejectStep]", getErrorMessage(e) || e);
    throw e;
  }
}

// ==================== APPROVAL WORKFLOW CRUD ====================


/**
 * Buka approval kalau ditolak: reset doc ke draft + buat approval baru.
 * Dipanggil dari UI detail dokumen ketika status `rejected`.
 */
export async function reopenApproval(approvalId: number) {
  try {
    await assertCSRF();
    const session = await auth();
    const user = session?.user;
    if (!user) throw new Error("Sesi berakhir. Silakan masuk kembali.");

    let refType = "";
    let refId = 0;

    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM approvals WHERE id = ${approvalId} FOR UPDATE`;
      const approval = await tx.approval.findUnique({
        where: { id: approvalId },
        include: { workflow: { include: { steps: true } } },
      });
      if (!approval) throw new Error("Approval tidak ditemukan");
      if (approval.status !== "rejected") throw new Error("Hanya approval yang ditolak yang bisa dibuka ulang");
      refType = approval.referenceType;
      refId = approval.referenceId;

      assertApprovalPermission(user, refType);

      await assertHrScopeForApproval(tx, approval.referenceType, approval.referenceId, user);

      // Reset source document status to draft/prior
      const modelKey = refType.charAt(0).toLowerCase() + refType.slice(1);
      const docModel = (tx as any)[modelKey];
      if (docModel?.updateMany) {
        await docModel.updateMany({
          where: { id: refId, status: "rejected" },
          data: { status: "draft" },
        });
      }

      // Import here to avoid circular dep top-level
      const { requestApprovalIfConfigured } = await import("@/lib/services/approval-workflow.service");
      const reopened = await requestApprovalIfConfigured(refType, refId, Number(user.id), tx);
      if (!reopened) {
        throw new Error("Gagal membuka ulang persetujuan — approval pending baru tidak terbentuk. Periksa alur persetujuan aktif untuk dokumen ini.");
      }
    });

    // Log + revalidate outside tx
    await logActivity("reopen", "Approval", approvalId, `Membuka ulang approval ${refType} #${refId}`);
    revalidatePath("/pengaturan/persetujuan");
    if (refType && refId) {
      const slugMap: Record<string, string> = {
        Quotation: "penjualan/penawaran",
        SalesOrder: "penjualan/pesanan",
        SalesInvoice: "penjualan/faktur",
        PurchaseRequest: "pembelian/permintaan",
        PurchaseOrder: "pembelian/pesanan",
        VendorBill: "pembelian/tagihan",
      };
      const base = slugMap[refType];
      if (base) revalidatePath(`/${base}`);
    }
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[reopenApproval]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}


export async function createApprovalWorkflow(formData: FormData) {
  try {
    await requirePermission("manage_settings");

    const parsed = parseFormData(createWorkflowSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const { name, modelType, code, isActive, steps: stepsJson } = parsed.data;

    const stepsResult = parseWorkflowSteps(stepsJson ?? null);
    if (!stepsResult.ok) return { success: false, error: stepsResult.error };
    const steps = stepsResult.steps.filter(
      (s) => s.roleId || s.userId || s.approverType || s.name,
    );
    if (isActive !== false && steps.length === 0) {
      return {
        success: false,
        error: "Alur persetujuan aktif minimal harus memiliki satu langkah.",
      };
    }

    const wf = await prisma.approvalWorkflow.create({
      data: {
        name,
        slug: await nextSlug("approvalWorkflow", name),
        modelType,
        code: code || null,
        isActive: isActive !== false,
        steps: {
          create: steps.map((s, i) => ({
            stepOrder: i + 1,
            name: s.name || `Langkah ${i + 1}`,
            roleId: s.roleId ? Number(s.roleId) : null,
            userId: s.userId ? Number(s.userId) : null,
            approverType: s.approverType || null,
          })),
        },
      },
    });

    await logActivity(
      "create",
      "ApprovalWorkflow",
      wf.id,
      `Membuat alur persetujuan ${name}`,
    );
    revalidatePath("/pengaturan/workflow");
    return { success: true, id: wf.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createApprovalWorkflow]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function updateApprovalWorkflow(id: number, formData: FormData) {
  try {
    await requirePermission("manage_settings");

    const parsed = parseFormData(updateWorkflowSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const { name, modelType, code, isActive, steps: stepsJson } = parsed.data;

    const stepsResult = parseWorkflowSteps(stepsJson ?? null);
    if (!stepsResult.ok) return { success: false, error: stepsResult.error };
    const steps = stepsResult.steps.filter(
      (s) => s.roleId || s.userId || s.approverType || s.name,
    );
    if (isActive !== false && steps.length === 0) {
      return {
        success: false,
        error: "Alur persetujuan aktif minimal harus memiliki satu langkah.",
      };
    }

    // Lock the workflow before checking pending approvals. requestApprovalIfConfigured
    // takes the same lock before inserting, so a new approval cannot appear
    // between the guard and step replacement.
    const pendingApprovals = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM approval_workflows WHERE id = ${id} FOR UPDATE`;
      const pendingCount = await tx.approval.count({
        where: { workflowId: id, status: "pending" },
      });
      if (pendingCount > 0) return pendingCount;

      const previous = await tx.approvalWorkflow.findUnique({
        where: { id },
        select: { modelType: true, name: true, isActive: true },
      });

      await tx.approvalWorkflowStep.deleteMany({ where: { workflowId: id } });
      await tx.approvalWorkflow.update({
        where: { id },
        data: {
          name,
          slug: await nextSlug("approvalWorkflow", name, { excludeId: id }),
          modelType,
          code: code || null,
          isActive: isActive !== false,
          steps: {
            create: steps.map((s, i) => ({
              stepOrder: i + 1,
              name: s.name || `Langkah ${i + 1}`,
              roleId: s.roleId ? Number(s.roleId) : null,
              userId: s.userId ? Number(s.userId) : null,
              approverType: s.approverType || null,
            })),
          },
        },
      });
      return { previous, pendingCount: 0 };
    });
    if (typeof pendingApprovals === "number") {
      return {
        success: false,
        error: `Tidak bisa mengubah langkah alur — masih ada ${pendingApprovals} persetujuan yang sedang berjalan. Selesaikan atau tolak terlebih dahulu.`,
      };
    }

    // K4-S2(a): transisi aktif -> nonaktif workflow gerbang uang tercatat.
    if (pendingApprovals.previous?.isActive && isActive === false) {
      await logMoneyGateChange("deactivate", {
        id,
        modelType: pendingApprovals.previous.modelType,
        name: pendingApprovals.previous.name,
      });
    } else if (
      pendingApprovals.previous?.isActive &&
      pendingApprovals.previous.modelType !== modelType
    ) {
      await logMoneyGateChange("retype", {
        id,
        modelType: pendingApprovals.previous.modelType,
        name: pendingApprovals.previous.name,
        newModelType: modelType,
      });
    }
    await logActivity(
      "update",
      "ApprovalWorkflow",
      id,
      `Memperbarui alur persetujuan ${name}`,
    );
    revalidatePath("/pengaturan/workflow");
    return { success: true, id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updateApprovalWorkflow]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function deleteApprovalWorkflow(id: number) {
  try {
    await requirePermission("manage_settings");

    // Match approval creation's workflow lock to prevent a new pending approval
    // from being inserted after the in-flight check.
    const pendingApprovals = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM approval_workflows WHERE id = ${id} FOR UPDATE`;
      const pendingCount = await tx.approval.count({
        where: { workflowId: id, status: "pending" },
      });
      if (pendingCount > 0) return pendingCount;
      const previous = await tx.approvalWorkflow.findUnique({
        where: { id },
        select: { modelType: true, name: true },
      });
      await tx.approvalWorkflow.update({
        where: { id },
        data: { deletedAt: new Date(), isActive: false },
      });
      return { previous, pendingCount: 0 };
    });
    if (typeof pendingApprovals === "number") {
      return {
        success: false,
        error: `Tidak bisa menghapus alur — masih ada ${pendingApprovals} persetujuan yang sedang berjalan.`,
      };
    }

    // K4-S2(a): penghapusan workflow gerbang uang tercatat eksplisit.
    if (pendingApprovals.previous) {
      await logMoneyGateChange("delete", {
        id,
        modelType: pendingApprovals.previous.modelType,
        name: pendingApprovals.previous.name,
      });
    }
    await logActivity(
      "delete",
      "ApprovalWorkflow",
      id,
      "Menghapus alur persetujuan",
    );
    revalidatePath("/pengaturan/workflow");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[deleteApprovalWorkflow]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}
