import "server-only"
import { hasPermission } from "@/lib/auth/permissions"
import { auth } from "@/lib/auth/auth"
import { prisma } from "@/lib/db/prisma"
import { assertWarehouseAccessMulti, getWarehouseScope } from "@/lib/auth/warehouse-scope"
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
}

const WAREHOUSE_FIELDS: Record<string, string[]> = {
  material_issue: ["warehouseId"],
  goods_receipt: ["warehouseId"],
  inventory_transfer: ["sourceWarehouseId", "destinationWarehouseId"],
  stock_adjustment: ["warehouseId"],
}

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
  permission: string | undefined,
): Promise<boolean> {
  const modelKey = ATTACHMENT_MODEL[referenceType]
  if (!permission || !modelKey || !Number.isSafeInteger(referenceId) || referenceId <= 0) return false
  if (!(await hasPermission(permission))) return false

  const model = (prisma as any)[modelKey]
  if (!model?.findUnique) return false
  const warehouseFields = WAREHOUSE_FIELDS[referenceType] ?? []
  const select = Object.fromEntries([["id", true], ...warehouseFields.map((field) => [field, true])])
  const document = await model.findUnique({ where: { id: referenceId }, select })
  if (!document) return false

  if (warehouseFields.length === 0) return true
  const session = await auth()
  if (!session?.user?.id) return false
  try {
    const scope = await getWarehouseScope({
      id: String(session.user.id),
      roles: Array.isArray(session.user.roles) ? session.user.roles : [],
    })
    const warehouseIds = warehouseFields.map((field) => document[field]).filter(Number.isInteger)
    if (warehouseIds.length !== warehouseFields.length) return false
    assertWarehouseAccessMulti(scope, warehouseIds)
    return true
  } catch {
    return false
  }
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
