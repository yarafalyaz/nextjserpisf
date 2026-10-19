import { safeAdd, safeSubtract, safeSum, type SafeMathInput } from "@/lib/utils/math"

export interface TaxSummaryTotals {
  totalOutput: number
  totalInput: number
  difference: number
  kurangBayar: boolean
}

export function buildTaxSummaryTotals(
  outputAmounts: readonly SafeMathInput[],
  inputAmounts: readonly SafeMathInput[],
): TaxSummaryTotals {
  const totalOutput = safeSum([...outputAmounts], 2)
  const totalInput = safeSum([...inputAmounts], 2)
  const difference = safeSubtract(totalOutput, totalInput, 2)
  return { totalOutput, totalInput, difference, kurangBayar: difference >= 0 }
}

export interface VatReconciliationTotals {
  bookOutput: number
  bookInput: number
  docOutput: number
  docInput: number
  netDifference: number
}

export function buildVatReconciliationTotals(input: {
  outputEntries: readonly { debit: SafeMathInput; credit: SafeMathInput }[]
  inputEntries: readonly { debit: SafeMathInput; credit: SafeMathInput }[]
  docOutputAmounts: readonly SafeMathInput[]
  docInputAmounts: readonly SafeMathInput[]
}): VatReconciliationTotals {
  const bookOutput = input.outputEntries.reduce((s, e) => safeAdd(s, safeSubtract(e.credit, e.debit, 2), 2), 0)
  const bookInput = input.inputEntries.reduce((s, e) => safeAdd(s, safeSubtract(e.debit, e.credit, 2), 2), 0)
  const docOutput = safeSum([...input.docOutputAmounts], 2)
  const docInput = safeSum([...input.docInputAmounts], 2)
  return {
    bookOutput,
    bookInput,
    docOutput,
    docInput,
    netDifference: safeSubtract(safeSubtract(bookOutput, docOutput, 2), safeSubtract(bookInput, docInput, 2), 2),
  }
}

export function buildWithholdingTotal(amounts: readonly SafeMathInput[]): number {
  return safeSum([...amounts], 2)
}

export function taxDocumentBase(subtotal: SafeMathInput, discount: SafeMathInput): number {
  return safeSubtract(subtotal, discount ?? 0, 2)
}
