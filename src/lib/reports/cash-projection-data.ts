/**
 * Cash-projection inputs (F-48a): outstanding receivables/payables that feed
 * `projectCash`. Pure by design (no Prisma) so the net-payable rule is testable.
 *
 * Payables are NET of withholding: utang ke supplier = grandTotal −
 * withholdingAmount − paidAmount, the same rule as `payableOutstanding`
 * (aging-amounts.ts) and the AP subledger. Using the gross total overstates
 * projected outflow by the PPh that is never paid to the supplier.
 */

import { payableOutstanding, receivableOutstanding } from "@/lib/reports/aging-amounts"
import type { SafeMathInput } from "@/lib/utils/math"
import type { CashFlowItem } from "@/lib/reports/cash-projection"

export interface ProjectionInvoiceInput {
  dueDate: Date
  grandTotal: SafeMathInput
  paidAmount: SafeMathInput
}

export interface ProjectionBillInput {
  dueDate: Date
  grandTotal: SafeMathInput
  withholdingAmount?: SafeMathInput
  paidAmount: SafeMathInput
}

export function buildCashProjectionInputs(input: {
  invoices: readonly ProjectionInvoiceInput[]
  bills: readonly ProjectionBillInput[]
}): { receivables: CashFlowItem[]; payables: CashFlowItem[] } {
  const receivables: CashFlowItem[] = []
  for (const inv of input.invoices) {
    const amount = receivableOutstanding(inv.grandTotal, inv.paidAmount)
    if (amount > 0) receivables.push({ dueDate: inv.dueDate, amount })
  }
  const payables: CashFlowItem[] = []
  for (const bill of input.bills) {
    const amount = payableOutstanding(bill.grandTotal, bill.withholdingAmount ?? 0, bill.paidAmount)
    if (amount > 0) payables.push({ dueDate: bill.dueDate, amount })
  }
  return { receivables, payables }
}
