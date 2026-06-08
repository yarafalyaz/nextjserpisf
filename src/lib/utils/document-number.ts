
import { DocumentSequenceService } from '@/lib/services/document-sequence.service'
import { prisma } from '@/lib/db/prisma'
import { getSystemSettings } from './settings'

/**
 * Mapping from prefix key → settings field name.
 * generateDocumentNumber resolves the actual prefix from system settings
 * using this map, falling back to the key itself.
 */
const PREFIX_FIELD_MAP: Record<string, string | undefined> = {
  QUO: 'quotationCodePrefix',
  SO: 'salesOrderPrefix',
  INV: 'salesInvoicePrefix',
  PAY: 'salesPaymentPrefix',
  SR: 'salesReturnPrefix',
  PR: 'purchaseRequestPrefix',
  PO: 'purchaseOrderPrefix',
  TRF: 'inventoryTransferPrefix',
  ADJ: 'stockAdjustmentPrefix',
  WO: 'workOrderPrefix',
  TS: 'timesheetPrefix',
  DP: 'downPaymentPrefix',
  DO: 'deliveryOrderPrefix',
  JRN: 'journalPrefix',
  EXP: 'expensePrefix',
  PC: 'pettyCashPrefix',
  REC: 'reconciliationPrefix',
  PAYROLL: 'payrollPrefix',
  PRJ: 'projectPrefix',
  GR: 'goodsReceiptPrefix',
  BILL: 'vendorBillPrefix',
  VPAY: 'vendorPaymentPrefix',
  PRET: 'purchaseReturnPrefix',
  TKT: 'ticketPrefix',
  LEAD: 'leadPrefix',
  MI: 'materialIssuePrefix',
  MO: 'manufacturingOrderPrefix',
  SM: 'stockMovementPrefix',
  // Master data codes (simple format, but still configurable)
  CUST: 'customerCodePrefix',
  VND: 'vendorCodePrefix',
  ITM: 'itemCodePrefix',
  PRD: 'productCodePrefix',
  AST: 'assetCodePrefix',
  WH: 'warehouseCodePrefix',
  EMP: 'employeeCodePrefix',
  MTP: 'paymentMethodCodePrefix',
  MTK: 'shippingMethodCodePrefix',
  ACC: undefined as string | undefined, // Account prefix not stored separately
  DEPT: undefined as string | undefined, // Department prefix not stored
  POS: undefined as string | undefined,  // Position prefix not stored
}

async function resolvePrefix(key: string): Promise<string> {
  const field = PREFIX_FIELD_MAP[key]
  // Normalize: strip any trailing separator/space so the caller can always append
  // its own "-" without producing a double dash (e.g. default "CUST-" -> "CUST").
  const normalize = (p: string) => p.trim().replace(/[-\s]+$/, '')
  if (!field) return normalize(key)
  const settings = await getSystemSettings()
  const value = (settings as Record<string, unknown>)[field]
  return value && String(value).trim() !== '' ? normalize(String(value)) : normalize(key)
}

const DOCUMENT_SOURCE_MAP: Record<string, { model: keyof typeof prisma; field: string; softDelete?: boolean }> = {
  QUO: { model: 'quotation', field: 'documentNo', softDelete: true },
  SO: { model: 'salesOrder', field: 'documentNo', softDelete: true },
  INV: { model: 'salesInvoice', field: 'documentNo', softDelete: true },
  PAY: { model: 'salesPayment', field: 'documentNo' },
  SR: { model: 'salesReturn', field: 'documentNo' },
  DP: { model: 'downPayment', field: 'documentNo' },
  DO: { model: 'deliveryOrder', field: 'documentNo' },
  PR: { model: 'purchaseRequest', field: 'documentNo' },
  PO: { model: 'purchaseOrder', field: 'documentNo' },
  GR: { model: 'goodsReceipt', field: 'documentNo' },
  BILL: { model: 'vendorBill', field: 'documentNo' },
  VPAY: { model: 'vendorPayment', field: 'documentNo' },
  PRET: { model: 'purchaseReturn', field: 'documentNo' },
  ADJ: { model: 'stockAdjustment', field: 'documentNo' },
  TRF: { model: 'inventoryTransfer', field: 'documentNo' },
  MI: { model: 'materialIssue', field: 'documentNo' },
  WO: { model: 'workOrder', field: 'documentNo' },
  MO: { model: 'productionOrder', field: 'documentNo' },
  JRN: { model: 'journal', field: 'journalNumber' },
  EXP: { model: 'expense', field: 'documentNo' },
  PC: { model: 'pettyCash', field: 'documentNo' },
  PAYROLL: { model: 'payroll', field: 'documentNo' },
  PRJ: { model: 'project', field: 'documentNo' },
  // Master data simple codes. NOTE: we deliberately do NOT filter soft-deleted
  // rows here. The code/sku/employeeNo columns carry a UNIQUE constraint that
  // also covers soft-deleted rows, so a soft-deleted record keeps its code
  // reserved. Counting only visible rows would hand out a number that collides
  // with a soft-deleted row's reserved code. Scanning ALL rows keeps the next
  // number both data-driven (a HARD delete lowers it) and collision-free.
  CUST: { model: 'customer', field: 'code' },
  VND: { model: 'vendor', field: 'code' },
  ITM: { model: 'item', field: 'sku' },
  WH: { model: 'warehouse', field: 'code' },
  EMP: { model: 'employee', field: 'employeeNo' },
  ACC: { model: 'account', field: 'code' },
  POS: { model: 'position', field: 'code' },
  DEPT: { model: 'department', field: 'code' },
  PRD: { model: 'product', field: 'code' },
  AST: { model: 'asset', field: 'code' },
  MTP: { model: 'paymentMethod', field: 'code' },
  MTK: { model: 'shippingMethod', field: 'code' },
}

/**
 * Find the highest sequence number already used for this key/period, by scanning
 * the source documents. Used only as a FLOOR for the atomic counter so that the
 * counter never collides with legacy/manually-entered document numbers. Returns 0
 * when there are no existing documents. We intentionally do NOT reuse gaps from
 * deleted/voided documents (audit continuity).
 */
async function findMaxSequence(key: string, prefix: string, format: 'complex' | 'simple', month: string, year: number): Promise<number> {
  const source = DOCUMENT_SOURCE_MAP[key]
  if (!source) return 0

  const delegate = prisma[source.model] as unknown as { findMany: (args: Record<string, unknown>) => Promise<Record<string, string | null>[]> }
  const where = {
    ...(format === 'complex'
      ? { [source.field]: { contains: `/${prefix}/`, endsWith: `/${month}/${year}` } }
      : { [source.field]: { startsWith: `${prefix}-` } }),
    ...(source.softDelete ? { deletedAt: null } : {}),
  }

  const rows = await delegate.findMany({
    where,
    select: { [source.field]: true },
  })

  let max = 0
  for (const row of rows) {
    const documentNo = row[source.field]
    if (!documentNo) continue
    const documentNoText = String(documentNo)
    const match = format === 'complex'
      ? documentNoText.match(/^(\d+)\//)
      : documentNoText.match(/-(\d+)$/)
    if (match) {
      const n = Number(match[1])
      if (n > max) max = n
    }
  }
  return max
}

/**
 * Generate a document number with complex or simple format.
 *
 * Complex format: 001/PREFIX/COMPANY/MM/YYYY
 * Simple format:  PREFIX-0001
 *
 * Prefix is resolved from system settings via PREFIX_FIELD_MAP.
 * Uses atomic sequence service to guarantee uniqueness.
 */
export async function generateDocumentNumber(
  key: string,
  format: 'complex' | 'simple' = 'complex'
): Promise<string> {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const year = now.getFullYear()
  const prefix = await resolvePrefix(key)

  if (format === 'complex') {
    const seqKey = `${prefix}-${year}-${month}`
    const floor = await findMaxSequence(key, prefix, format, month, year)
    const seq = await DocumentSequenceService.next(seqKey, floor)
    const settings = await getSystemSettings()
    const companyCode = settings.companyName?.substring(0, 3).toUpperCase() ?? 'YRA'
    return `${String(seq).padStart(3, '0')}/${prefix}/${companyCode}/${month}/${year}`
  } else {
    // Master-data codes (CUST/VND/ITM/EMP/POS/WH/ACC/...) are DATA-DRIVEN:
    // next = (highest sequence currently in the table) + 1. This reflects the
    // actual records — deleting rows lowers the next number — instead of using a
    // monotonic counter that never decrements. The unique code column + caller
    // retry loop handle the rare concurrent-create collision.
    const seq = (await findMaxSequence(key, prefix, format, month, year)) + 1
    return `${prefix}-${String(seq).padStart(4, '0')}`
  }
}

/**
 * Peek at the next document number WITHOUT incrementing the counter.
 */
export async function peekNextDocumentNumber(
  key: string,
  format: 'complex' | 'simple' = 'simple'
): Promise<string> {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const year = now.getFullYear()
  const prefix = await resolvePrefix(key)

  if (format === 'simple') {
    // Data-driven (mirror generateDocumentNumber): next = max in table + 1.
    const maxUsed = await findMaxSequence(key, prefix, format, month, year)
    const next = maxUsed + 1
    return `${prefix}-${String(next).padStart(4, '0')}`
  } else {
    const maxUsed = await findMaxSequence(key, prefix, format, month, year)
    const counter = await DocumentSequenceService.peek(`${prefix}-${year}-${month}`)
    const next = Math.max(maxUsed, counter) + 1
    const settings = await getSystemSettings()
    const companyCode = settings.companyName?.substring(0, 3).toUpperCase() ?? 'YRA'
    return `${String(next).padStart(3, '0')}/${prefix}/${companyCode}/${month}/${year}`
  }
}
