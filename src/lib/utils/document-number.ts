
import { DocumentSequenceService } from '@/lib/services/document-sequence.service'
import { prisma } from '@/lib/db/prisma'
import { getSystemSettings } from './settings'

/**
 * Mapping from prefix key → settings field name.
 * generateDocumentNumber resolves the actual prefix from system settings
 * using this map, falling back to the key itself.
 */
const PREFIX_FIELD_MAP: Record<string, string> = {
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
  ACC: undefined as any, // Account prefix not stored separately
  DEPT: undefined as any, // Department prefix not stored
  POS: undefined as any,  // Position prefix not stored
}

async function resolvePrefix(key: string): Promise<string> {
  const field = PREFIX_FIELD_MAP[key]
  if (!field) return key
  const settings = await getSystemSettings()
  const value = (settings as any)[field]
  return value && String(value).trim() !== '' ? String(value) : key
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
  JRN: { model: 'journalEntry', field: 'journalNumber' },
  EXP: { model: 'expense', field: 'documentNo', softDelete: true },
  PC: { model: 'pettyCash', field: 'documentNo' },
  PAYROLL: { model: 'payroll', field: 'documentNo' },
  PRJ: { model: 'project', field: 'documentNo' },
}

async function findReusableSequence(key: string, prefix: string, format: 'complex' | 'simple', month: string, year: number): Promise<number | null> {
  const source = DOCUMENT_SOURCE_MAP[key]
  if (!source) return null

  const delegate = prisma[source.model] as unknown as { findMany: (args: any) => Promise<Record<string, string | null>[]> }
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

  const used = new Set<number>()
  for (const row of rows) {
    const documentNo = row[source.field]
    if (!documentNo) continue
    const documentNoText = String(documentNo)
    const match = format === 'complex'
      ? documentNoText.match(/^(\d+)\//)
      : documentNoText.match(/-(\d+)$/)
    if (match) used.add(Number(match[1]))
  }

  let reusable = 1
  while (used.has(reusable)) reusable += 1
  return reusable
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
    const seq = await findReusableSequence(key, prefix, format, month, year)
      ?? await DocumentSequenceService.next(`${prefix}-${year}-${month}`)
    const settings = await getSystemSettings()
    const companyCode = settings.companyName?.substring(0, 3).toUpperCase() ?? 'YRA'
    return `${String(seq).padStart(3, '0')}/${prefix}/${companyCode}/${month}/${year}`
  } else {
    const seq = await findReusableSequence(key, prefix, format, month, year)
      ?? await DocumentSequenceService.next(`${prefix}-GLOBAL`)
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
    const next = await findReusableSequence(key, prefix, format, month, year)
      ?? ((await DocumentSequenceService.peek(`${prefix}-GLOBAL`)) + 1)
    return `${prefix}-${String(next).padStart(4, '0')}`
  } else {
    const next = await findReusableSequence(key, prefix, format, month, year)
      ?? ((await DocumentSequenceService.peek(`${prefix}-${year}-${month}`)) + 1)
    const settings = await getSystemSettings()
    const companyCode = settings.companyName?.substring(0, 3).toUpperCase() ?? 'YRA'
    return `${String(next).padStart(3, '0')}/${prefix}/${companyCode}/${month}/${year}`
  }
}
