
import { DocumentSequenceService } from '@/lib/services/document-sequence.service'
import { getSystemSettings } from './settings'

/**
 * Generate a document number with complex or simple format.
 *
 * Complex format: 001/PREFIX/COMPANY/MM/YYYY
 * Simple format:  PREFIX-0001
 *
 * Uses atomic sequence service to guarantee uniqueness.
 */
export async function generateDocumentNumber(
  prefix: string,
  format: 'complex' | 'simple' = 'complex'
): Promise<string> {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const year = now.getFullYear()

  if (format === 'complex') {
    // Key includes year and month for monthly reset
    const key = `${prefix}-${year}-${month}`
    const seq = await DocumentSequenceService.next(key)
    const settings = await getSystemSettings()
    const companyCode = settings.companyName?.substring(0, 3).toUpperCase() ?? 'YRA'
    return `${String(seq).padStart(3, '0')}/${prefix}/${companyCode}/${month}/${year}`
  } else {
    // Global sequence — never resets
    const key = `${prefix}-GLOBAL`
    const seq = await DocumentSequenceService.next(key)
    return `${prefix}-${String(seq).padStart(4, '0')}`
  }
}

/**
 * Generate a document number with a custom format pattern.
 *
 * Supported placeholders:
 * - {SEQ}    → sequence number (zero-padded)
 * - {PREFIX} → the prefix
 * - {COMPANY} → company code from settings
 * - {MM}    → month (2 digits)
 * - {YYYY}  → full year
 * - {YY}    → short year
 *
 * Example: "{SEQ}/{PREFIX}/{COMPANY}/{MM}/{YYYY}"
 */
export async function generateCustomDocumentNumber(
  prefix: string,
  pattern: string,
  seqPadding: number = 3
): Promise<string> {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const year = now.getFullYear()
  const shortYear = String(year).slice(-2)

  const key = `${prefix}-${year}-${month}`
  const seq = await DocumentSequenceService.next(key)
  const settings = await getSystemSettings()
  const companyCode = settings.companyName?.substring(0, 3).toUpperCase() ?? 'YRA'

  return pattern
    .replace('{SEQ}', String(seq).padStart(seqPadding, '0'))
    .replace('{PREFIX}', prefix)
    .replace('{COMPANY}', companyCode)
    .replace('{MM}', month)
    .replace('{YYYY}', String(year))
    .replace('{YY}', shortYear)
}

/**
 * Peek at the next document number WITHOUT incrementing the counter.
 * Use this for displaying in forms before submission.
 */
export async function peekNextDocumentNumber(
  prefix: string,
  format: 'complex' | 'simple' = 'simple'
): Promise<string> {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const year = now.getFullYear()

  if (format === 'simple') {
    const key = `${prefix}-GLOBAL`
    const current = await DocumentSequenceService.peek(key)
    const next = current + 1
    return `${prefix}-${String(next).padStart(4, '0')}`
  } else {
    const key = `${prefix}-${year}-${month}`
    const current = await DocumentSequenceService.peek(key)
    const next = current + 1
    const settings = await getSystemSettings()
    const companyCode = settings.companyName?.substring(0, 3).toUpperCase() ?? 'YRA'
    return `${String(next).padStart(3, '0')}/${prefix}/${companyCode}/${month}/${year}`
  }
}
