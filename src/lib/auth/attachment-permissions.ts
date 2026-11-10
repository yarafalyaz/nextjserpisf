import type { PermissionName } from "@/lib/setup/base-data"
import "server-only"
import { Prisma } from "@prisma/client"
import { hasPermission } from "@/lib/auth/permissions"
import { auth } from "@/lib/auth/auth"
import { prisma } from "@/lib/db/prisma"
import { canAccessWarehouseScopedDocument } from "@/lib/auth/document-scope"
import { getHrScope } from "@/lib/auth/hr-scope"
import {
  ATTACHMENT_CREATE_PERMISSION,
  ATTACHMENT_PERMISSION,
  ATTACHMENT_WRITE_PERMISSION,
} from "./attachment-permission-maps"

// Re-exported for server-side callers; the browser must import the maps from
// "./attachment-permission-maps" instead (see that file for why).
export { ATTACHMENT_PERMISSION, ATTACHMENT_WRITE_PERMISSION } from "./attachment-permission-maps"

const ATTACHMENT_MODEL: Record<string, string> = {
  sales_invoice: "salesInvoice",
  sales_order: "salesOrder",
  quotation: "quotation",
  purchase_order: "purchaseOrder",
  vendor_bill: "vendorBill",
  vendor_payment: "vendorPayment",
  sales_payment: "salesPayment",
  down_payment: "downPayment",
  journal: "journal",
  expense: "expense",
  material_issue: "materialIssue",
  work_order: "workOrder",
  project: "project",
  goods_receipt: "goodsReceipt",
  purchase_return: "purchaseReturn",
  sales_return: "salesReturn",
  bank_statement: "bankStatement",
  delivery_order: "deliveryOrder",
  inventory_transfer: "inventoryTransfer",
  stock_adjustment: "stockAdjustment",
  petty_cash: "pettyCash",
  WarrantyClaim: "warrantyClaim",
  EmployeeDisciplinaryRecord: "employeeDisciplinaryRecord",
  // R7API-01/R7PR-04: tipe ini sudah ada di whitelist route + peta izin +
  // UI sengketa pajak, tapi tak pernah dipetakan ke delegate — semua
  // operasi lampirannya 403 termasuk super_admin.
  tax_assessment: "taxAssessment",
  tax_dispute_step: "taxDisputeStep",
}

// R7API-01: induk yang wajib ikut diperiksa deletedAt-nya. TaxDisputeStep
// sendiri tak punya kolom deletedAt; ketetapan induk yang terhapus harus
// menutup lampiran langkahnya juga (mode gerbang R6PA-02).
const ATTACHMENT_PARENT: Record<string, { model: string; foreignKey: string }> = {
  tax_dispute_step: { model: "taxAssessment", foreignKey: "assessmentId" },
}

// Putaran 51: model referensi lampiran yang PUNYA kolom deletedAt, dibaca
// dari DMMF skema (preseden bulk.actions.ts) — bukan daftar tangan. Prisma
// menolak select field yang tidak ada pada model, jadi select deletedAt
// hanya boleh dikirim ke model yang benar-benar punya kolom itu; 16 dari
// 30 model referensi lampiran tidak punya (SalesPayment, Expense, dst).
const MODELS_WITH_DELETED_AT = new Set(
  Prisma.dmmf.datamodel.models
    .filter((m) => m.fields.some((f) => f.name === "deletedAt"))
    .map((m) => m.name.charAt(0).toLowerCase() + m.name.slice(1)),
)

// F-2026-10-24-096-S: model induk foto tahap/inspeksi.
for (const [type, model] of Object.entries({
  customer_vehicle: "customerVehicle",
  project_stage: "projectStage",
  work_order_operation: "workOrderOperation",
  qc_inspection: "qcInspection",
})) ATTACHMENT_MODEL[type] = model

// Maps a transaction-attachment referenceType to the view-permission required
// to access documents of that type. Used to gate attachment upload/list/serve
// so that being logged in is not sufficient — the caller must also be allowed
// to view the underlying document (mirrors PRINT_PERMISSION in print/route.ts).
// Closes the IDOR where any authenticated user could attach to / list / read
// attachments of any document by id.


/**
 * Returns true if the current session may access attachments for the given
 * referenceType. Unknown reference types are denied (fail-closed). super_admin
 * bypasses via hasPermission.
 */
async function canAccessAttachmentWithPermission(
  referenceType: string,
  referenceId: number,
  permission: PermissionName | undefined,
): Promise<boolean> {
  const modelKey = ATTACHMENT_MODEL[referenceType]
  if (!permission || !modelKey || !Number.isSafeInteger(referenceId) || referenceId <= 0) return false
  if (!(await hasPermission(permission))) return false

  const model = (prisma as Record<string, any>)[modelKey]
  if (!model?.findUnique) return false
  // R6PA-02: dokumen induk soft-deleted tidak boleh lagi melayani lampiran
  // (unduh/daftar/tulis). Model tanpa kolom deletedAt tidak ikut dinilai —
  // select-nya tidak boleh memuat deletedAt (Prisma menolak field tak ada).
  const parent = ATTACHMENT_PARENT[referenceType]
  // Putaran 69: rekod disiplin dinilai HR scope subjeknya (AC-DISC-5,
  // paritas halaman sdm/disiplin/[id]) — izin view saja membuka lampiran
  // bukti karyawan di luar cakupan pemanggil.
  const hrScoped = referenceType === "EmployeeDisciplinaryRecord"
  const document = await model.findUnique({
    where: { id: referenceId },
    select: {
      id: true,
      ...(MODELS_WITH_DELETED_AT.has(modelKey) ? { deletedAt: true } : {}),
      ...(parent ? { [parent.foreignKey]: true } : {}),
      ...(hrScoped ? { employeeId: true } : {}),
    },
  })
  if (!document || document.deletedAt) return false

  if (hrScoped) {
    const session = await auth()
    if (!session?.user) return false
    const scope = await getHrScope({
      id: session.user.id,
      roles: (session.user as { roles?: string[] }).roles ?? [],
    })
    // Penilaian scope tanpa throw (assertHrEmployeeAccess melempar):
    // kind dinilai eksplisit; department memeriksa departemen subjek
    // lewat delegate employee, sama seperti helper bersama.
    const subjectId = document.employeeId as number
    if (scope.kind === "team" && !scope.memberIds.includes(subjectId)) return false
    if (scope.kind === "self" && scope.employeeId !== subjectId) return false
    if (scope.kind === "department") {
      if (scope.departmentId == null) {
        if (scope.employeeId !== subjectId) return false
      } else {
        const subject = await prisma.employee.findUnique({
          where: { id: subjectId },
          select: { departmentId: true },
        })
        if (!subject || subject.departmentId !== scope.departmentId) return false
      }
    }
  }

  // R7API-01: induk (mis. ketetapan dari langkah sengketa) yang terhapus
  // menutup lampirannya — dicek langsung karena deletedAt langkah kosong.
  if (parent) {
    const parentModel = (prisma as Record<string, any>)[parent.model]
    if (!parentModel?.findUnique) return false
    const parentDoc = await parentModel.findUnique({
      where: { id: document[parent.foreignKey] },
      select: {
        id: true,
        ...(MODELS_WITH_DELETED_AT.has(parent.model) ? { deletedAt: true } : {}),
      },
    })
    if (!parentDoc || parentDoc.deletedAt) return false
  }

  // Dokumen yang dibatasi gudang memakai penjagaan bersama dengan route cetak,
  // sehingga lampiran dan cetak tidak bisa berbeda aturan. Dokumen lain lolos.
  const session = await auth()
  return canAccessWarehouseScopedDocument(referenceType, referenceId, session)
}

export async function canAccessAttachment(referenceType: string, referenceId: number): Promise<boolean> {
  return canAccessAttachmentWithPermission(
    referenceType,
    referenceId,
    ATTACHMENT_PERMISSION[referenceType],
  )
}

/** Permission check for uploading/deleting attachments on an existing record. */
export async function canModifyAttachment(referenceType: string, referenceId: number): Promise<boolean> {
  if (referenceId === 0) {
    const createPermission = ATTACHMENT_CREATE_PERMISSION[referenceType]
    const writePermission = ATTACHMENT_WRITE_PERMISSION[referenceType]
    if (!createPermission) return false
    return await hasPermission(createPermission) ||
      Boolean(writePermission && await hasPermission(writePermission))
  }
  return canAccessAttachmentWithPermission(
    referenceType,
    referenceId,
    ATTACHMENT_WRITE_PERMISSION[referenceType],
  )
}
