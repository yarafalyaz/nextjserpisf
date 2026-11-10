import type { Prisma, PrismaClient } from "@prisma/client"

export const APPROVAL_DOC_MODELS = [
  "quotation",
  "salesOrder",
  "salesInvoice",
  "purchaseRequest",
  "purchaseOrder",
  "vendorBill",
  "leaveRequest",
  "overtimeRequest",
  "employeeLoan",
  "expense",
  "payroll",
] as const

export type ApprovalDocModelKey = (typeof APPROVAL_DOC_MODELS)[number]

const APPROVAL_DOC_MODEL_SET = new Set<string>(APPROVAL_DOC_MODELS)

export function isApprovalDocModelKey(key: string): key is ApprovalDocModelKey {
  return APPROVAL_DOC_MODEL_SET.has(key)
}

export type DbClientOrTx = PrismaClient | Prisma.TransactionClient

export interface ApprovalDocDelegate {
  findUnique(args: any): Promise<any>
  update(args: any): Promise<any>
  updateMany(args: any): Promise<{ count: number }>
}

/**
 * Returns a typed model delegate from a PrismaClient or transaction client
 * only if the model key is in the allowlist of approval models.
 */
export function getApprovalDocDelegate(
  db: DbClientOrTx,
  modelKeyOrRefType: string
): ApprovalDocDelegate | null {
  const modelKey =
    modelKeyOrRefType.charAt(0).toLowerCase() + modelKeyOrRefType.slice(1)
  if (!isApprovalDocModelKey(modelKey)) {
    return null
  }
  const delegate = (db as any)[modelKey]
  return delegate ?? null
}
