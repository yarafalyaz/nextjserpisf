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
import type { Prisma } from "@prisma/client";

type WorkflowStepInput = {
  name?: string;
  roleId?: number | null;
  userId?: number | null;
  approverType?: string | null;
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

const APPROVAL_REFERENCE_PERMISSIONS: Record<string, string> = {
  Quotation: "approve_quotations",
  SalesOrder: "approve_sales_orders",
  SalesInvoice: "approve_sales_invoices",
  PurchaseRequest: "approve_purchase_requests",
  PurchaseOrder: "approve_purchase_orders",
  VendorBill: "approve_vendor_bills",
  LeaveRequest: "approve_leave_requests",
  OvertimeRequest: "approve_overtime_requests",
  EmployeeLoan: "create_loans",
  Expense: "approve_expenses",
};

function assertApprovalPermission(
  user: { roles?: string[]; permissions?: string[]; isActive?: boolean },
  referenceType: string,
): void {
  if (user.isActive === false) throw new Error("Unauthorized");
  if (user.roles?.includes("super_admin")) return;
  const permissions = user.permissions ?? [];
  const referencePermission = APPROVAL_REFERENCE_PERMISSIONS[referenceType];
  if (
    !permissions.includes("approve_workflows") &&
    !(referencePermission && permissions.includes(referencePermission))
  ) {
    throw new Error("Forbidden: Anda tidak memiliki izin menyetujui dokumen ini.");
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
      throw new Error("Forbidden: Anda bukan approver untuk langkah ini.");
    }
    return;
  }
  if (stepDef.roleId != null) {
    const role = await prisma.role.findUnique({
      where: { id: stepDef.roleId },
      select: { name: true },
    });
    if (!role || !user.roles.includes(role.name)) {
      throw new Error("Forbidden: Anda bukan approver untuk langkah ini.");
    }
  }
}

export async function approveStep(approvalId: number, formData: FormData) {
  try {
    await assertCSRF();
    const session = await auth();
    const user = session?.user;
    if (!user) throw new Error("Unauthorized");

    const parsed = parseFormData(approveStepSchema, formData);
    if (!parsed.success) throw new Error(parsed.error);
    const { notes } = parsed.data;

    // Set when this approveStep completes an Expense workflow. The petty-cash
    // sync must run AFTER the transaction commits (the hook manages its own
    // transaction and is idempotent on documentNo), so we capture the id here
    // and run it below rather than nesting it inside this transaction.
    let expenseToSync: number | null = null;

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
        if (docModel?.update) {
          const docStatus = approval.referenceType === "EmployeeLoan" ? "active" : "approved";
          const approvedBy = session?.user?.id ? Number(session.user.id) : null;
          await docModel.update({
            where: { id: approval.referenceId },
            data: {
              status: docStatus,
              ...(APPROVED_BY_MODELS.has(approval.referenceType) ? { approvedBy } : {}),
            },
          });
          if (approval.referenceType === "EmployeeLoan") {
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
    revalidatePath(`/pengaturan/persetujuan/${approvalId}`);
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
    if (!user) throw new Error("Unauthorized");

    const parsed = parseFormData(rejectStepSchema, formData);
    if (!parsed.success) throw new Error(parsed.error);
    const { notes } = parsed.data;

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
      if (docModel?.update) {
        const data: Record<string, unknown> = { status: "rejected" };
        if (REJECTION_REASON_MODELS.has(approval.referenceType)) {
          data.rejectionReason = notes || null;
        }
        await docModel.update({
          where: { id: approval.referenceId },
          data,
        });
      }
    });

    await logActivity(
      "reject",
      "Approval",
      approvalId,
      "Menolak langkah persetujuan",
    );
    revalidatePath(`/pengaturan/persetujuan/${approvalId}`);
    revalidatePath("/pengaturan/persetujuan");
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[rejectStep]", getErrorMessage(e) || e);
    throw e;
  }
}

// ==================== APPROVAL WORKFLOW CRUD ====================

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

      await tx.approvalWorkflowStep.deleteMany({ where: { workflowId: id } });
      await tx.approvalWorkflow.update({
        where: { id },
        data: {
          name,
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
      return 0;
    });
    if (pendingApprovals > 0) {
      return {
        success: false,
        error: `Tidak bisa mengubah langkah alur — masih ada ${pendingApprovals} persetujuan yang sedang berjalan. Selesaikan atau tolak terlebih dahulu.`,
      };
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
      await tx.approvalWorkflow.update({
        where: { id },
        data: { deletedAt: new Date(), isActive: false },
      });
      return 0;
    });
    if (pendingApprovals > 0) {
      return {
        success: false,
        error: `Tidak bisa menghapus alur — masih ada ${pendingApprovals} persetujuan yang sedang berjalan.`,
      };
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
