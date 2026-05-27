
import { DocumentSequenceService } from '@/lib/services/document-sequence.service'
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
  WH: 'warehouseCodePrefix',
  EMP: 'employeeCodePrefix',
  ACC: undefined as any, // Account prefix not stored separately
  DEPT: undefined as any, // Department prefix not stored
  POS: undefined as any,  // Position prefix not stored
}

/** Resolve actual prefix from system settings. Falls back to provided key. */
async function resolvePrefix(key: string): Promise<string> {
  const field = PREFIX_FIELD_MAP[key]
  if (!field) return key
  const settings = await getSystemSettings()
  const value = (settings as any)[field]
  return value && String(value).trim() !== '' ? String(value) : key
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
    // Key includes year and month for monthly reset
    const seqKey = `${prefix}-${year}-${month}`
    const seq = await DocumentSequenceService.next(seqKey)
    const settings = await getSystemSettings()
    const companyCode = settings.companyName?.substring(0, 3).toUpperCase() ?? 'YRA'
    return `${String(seq).padStart(3, '0')}/${prefix}/${companyCode}/${month}/${year}`
  } else {
    // Global sequence — never resets
    const seqKey = `${prefix}-GLOBAL`
    const seq = await DocumentSequenceService.next(seqKey)
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
    const seqKey = `${prefix}-GLOBAL`
    const current = await DocumentSequenceService.peek(seqKey)
    const next = current + 1
    return `${prefix}-${String(next).padStart(4, '0')}`
  } else {
    const seqKey = `${prefix}-${year}-${month}`
    const current = await DocumentSequenceService.peek(seqKey)
    const next = current + 1
    const settings = await getSystemSettings()
    const companyCode = settings.companyName?.substring(0, 3).toUpperCase() ?? 'YRA'
    return `${String(next).padStart(3, '0')}/${prefix}/${companyCode}/${month}/${year}`
  }
}
