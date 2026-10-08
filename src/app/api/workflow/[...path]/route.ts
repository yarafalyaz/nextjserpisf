
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { auth } from "@/lib/auth/auth"
import { revalidatePath } from "next/cache"
import { Status } from "@/lib/constants"
import { apiError } from "@/lib/api-response"
import { approveStep, rejectStep } from "@/actions/approval.actions"
import { requestApprovalIfConfigured } from "@/lib/services/approval-workflow.service"
import { onEmployeeLoanDisbursed } from "@/lib/hooks/accounting.hook"
import { approveOvertime } from "@/actions/hrm.actions"
import { assertCSRF } from "@/lib/security/csrf"
import { APPROVAL_REFERENCE_PERMISSIONS } from "@/lib/auth/approval-permissions"


/**
 * Module slug -> Prisma delegate + revalidate path + approval reference type.
 * The permission is NOT stored here: it is derived from
 * APPROVAL_REFERENCE_PERMISSIONS[modelType] so the status-button route and
 * approveStep/rejectStep (the detail-page flow) can never drift apart.
 */
const MODULE_MAP: Record<string, { model: string; modelType: string; revalidate: string }> = {
  "penjualan/penawaran": { model: "quotation", modelType: "Quotation", revalidate: "/penjualan/penawaran" },
  "penjualan/pesanan": { model: "salesOrder", modelType: "SalesOrder", revalidate: "/penjualan/pesanan" },
  "penjualan/faktur": { model: "salesInvoice", modelType: "SalesInvoice", revalidate: "/penjualan/faktur" },
  "pembelian/permintaan": { model: "purchaseRequest", modelType: "PurchaseRequest", revalidate: "/pembelian/permintaan" },
  "pembelian/pesanan": { model: "purchaseOrder", modelType: "PurchaseOrder", revalidate: "/pembelian/pesanan" },
  "pembelian/tagihan": { model: "vendorBill", modelType: "VendorBill", revalidate: "/pembelian/tagihan" },
  "sdm/cuti": { model: "leaveRequest", modelType: "LeaveRequest", revalidate: "/sdm/cuti" },
  "sdm/lembur": { model: "overtimeRequest", modelType: "OvertimeRequest", revalidate: "/sdm/lembur" },
  // EmployeeLoan approval/disbursement used to be gated by "create_loans",
  // which let whoever raised a loan also approve + disburse it. The dedicated
  // "approve_loans" permission (see approval-permissions.ts) separates them.
  "sdm/pinjaman": { model: "employeeLoan", modelType: "EmployeeLoan", revalidate: "/sdm/pinjaman" },
}

/**
 * Baseline status guard when no active approval workflow is configured.
 * Extracted as a named constant so the manual approve/reject path and its
 * parity test share one definition. "approved" is deliberately NOT in the
 * list: once a document is approved the manual button no longer offers the
 * action (see StatusActions), and re-running approve would re-fire side
 * effects such as employee-loan disbursement.
 */
const STATUS_ALLOWED_FROM = ["pending", "draft", "sent"]

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  // Auth check — reject unauthenticated requests
  const session = await auth()
  if (!session?.user) {
    return apiError("UNAUTHORIZED", "Tidak terotorisasi")
  }

  const { path } = await params
  if (!Array.isArray(path) || path.length < 3) {
    return apiError("BAD_REQUEST", "Path tidak valid")
  }

  const action = path[path.length - 1] // "approve" or "reject"
  const idRaw = path[path.length - 2]
  const id = Number(idRaw)
  if (!Number.isSafeInteger(id) || id <= 0) {
    return apiError("BAD_REQUEST", "ID tidak valid")
  }

  const moduleKey = path.slice(0, path.length - 2).join("/")

  const config = MODULE_MAP[moduleKey]
  if (!config) {
    return apiError("NOT_FOUND", "Modul tidak ditemukan")
  }

  // Permission check — super_admin bypasses. The permission is derived from
  // the shared reference map so this route and approveStep/rejectStep cannot
  // disagree about who may approve a given document type.
  const userRoles = session.user.roles as string[] | undefined
  const userPermissions = session.user.permissions as string[] | undefined
  const requiredPermission = APPROVAL_REFERENCE_PERMISSIONS[config.modelType]
  if (!requiredPermission) {
    return apiError("INTERNAL_ERROR", "Izin approval untuk modul ini belum dipetakan")
  }
  if (!userRoles?.includes("super_admin") && !userPermissions?.includes(requiredPermission)) {
    return apiError("FORBIDDEN", "Anda tidak memiliki izin untuk aksi ini")
  }

  if (action !== "approve" && action !== "reject") {
    return apiError("BAD_REQUEST", "Aksi tidak valid")
  }

  const modelType = config.modelType

  try {
    await assertCSRF()
    if (modelType) {
      const activeWorkflow = await prisma.approvalWorkflow.findFirst({
        where: { modelType, isActive: true, deletedAt: null },
      })

      if (activeWorkflow) {
        let approval = await prisma.approval.findFirst({
          where: { referenceType: modelType, referenceId: id },
          orderBy: { id: "desc" },
        })

        if (!approval) {
          const delegate = prisma[config.model as keyof typeof prisma] as any
          const doc = await delegate.findUnique({ where: { id }, select: { createdBy: true } })
          const docCreatedBy = doc?.createdBy ? Number(doc.createdBy) : Number(session.user.id)
          await requestApprovalIfConfigured(modelType, id, docCreatedBy)
          approval = await prisma.approval.findFirst({
            where: { referenceType: modelType, referenceId: id },
            orderBy: { id: "desc" },
          })
        }

        if (!approval) {
          return apiError("INTERNAL_ERROR", "Gagal menginisiasi alur persetujuan")
        }

        if (approval.status === "approved" || approval.status === "rejected") {
          return apiError("CONFLICT", `Alur persetujuan sudah selesai dengan status '${approval.status}'`)
        }

        const formData = new FormData()
        formData.append("notes", action === "approve" ? "Disetujui via tombol status" : "Ditolak via tombol status")

        if (action === "approve") {
          await approveStep(approval.id, formData)
        } else {
          await rejectStep(approval.id, formData)
        }

        const updatedApproval = await prisma.approval.findUnique({
          where: { id: approval.id },
        })

        if (!updatedApproval) {
          return apiError("INTERNAL_ERROR", "Gagal membaca pembaruan alur persetujuan")
        }

        if (updatedApproval.status === "approved" || updatedApproval.status === "rejected") {
          const docStatus = modelType === "EmployeeLoan"
            ? (updatedApproval.status === "approved" ? "active" : Status.REJECTED)
            : (updatedApproval.status === "approved" ? Status.APPROVED : Status.REJECTED)
          // Domain side-effect on completion: approving overtime must COMPUTE the
          // pay value (calculatedValue) — the approval engine only flips status,
          // it never runs domain logic. Without this, workflow-approved overtime
          // carried calculatedValue = 0 and the overtime pay silently vanished
          // from payroll. approveOvertime is idempotent, so a repeat click is a
          // no-op.
          if (modelType === "OvertimeRequest" && updatedApproval.status === "approved") {
            const result = await approveOvertime(id)
            if (result && result.success === false) {
              return apiError("INTERNAL_ERROR", result.error || "Gagal menghitung nilai lembur")
            }
          }
          revalidatePath(config.revalidate)
          return NextResponse.json({ success: true, status: docStatus })
        }

        const delegate = prisma[config.model as keyof typeof prisma] as any
        await delegate.updateMany({
          where: { id, status: { in: ["draft", "pending"] } },
          data: { status: "pending" },
        })

        revalidatePath(config.revalidate)
        return NextResponse.json({ success: true, status: "pending" })
      }
    }

    let newStatus: string = action === "approve" ? Status.APPROVED : Status.REJECTED
    if (config.model === "employeeLoan" && newStatus === Status.APPROVED) {
      newStatus = "active"
    }
    const allowedFrom = STATUS_ALLOWED_FROM
    const delegate = prisma[config.model as keyof typeof prisma] as any

    let result
    if (config.model === "employeeLoan" && newStatus === "active") {
      result = await prisma.$transaction(async (tx) => {
        const updateResult = await tx.employeeLoan.updateMany({
          where: { id, status: { in: allowedFrom } },
          data: { status: "active" },
        })
        if (updateResult.count > 0) {
          await onEmployeeLoanDisbursed(id, Number(session.user.id), tx)
        }
        return updateResult
      })
    } else if (modelType === "OvertimeRequest" && newStatus === Status.APPROVED) {
      // No workflow configured: this status button is the only approval gate.
      // Route through approveOvertime so the pay value (calculatedValue) is
      // computed — a plain status flip would leave it 0 and drop the pay from
      // payroll.
      const res = await approveOvertime(id)
      if (res && res.success === false) {
        return apiError("CONFLICT", res.error || "Gagal menyetujui lembur")
      }
      result = { count: 1 }
    } else {
      result = await delegate.updateMany({
        where: { id, status: { in: allowedFrom } },
        data: { status: newStatus },
      })
    }

    if (result.count === 0) {
      const exists = await delegate.findUnique({ where: { id }, select: { id: true, status: true } })
      if (!exists) {
        return apiError("NOT_FOUND", "Data tidak ditemukan")
      }
      return apiError("CONFLICT", `Tidak dapat mengubah status dari '${exists.status}' menjadi '${newStatus}'`)
    }

    revalidatePath(config.revalidate)
    return NextResponse.json({ success: true, status: newStatus })
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("CSRF validation failed:")) {
      return apiError("FORBIDDEN", "Permintaan lintas situs ditolak")
    }
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "P2025") {
      return apiError("NOT_FOUND", "Data tidak ditemukan")
    }
    return apiError("INTERNAL_ERROR", error instanceof Error ? error.message : "Failed to update status")
  }
}
