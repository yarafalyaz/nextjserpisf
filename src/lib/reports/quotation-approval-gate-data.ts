/**
 * Loader read-only ambang persetujuan penawaran (F-2026-10-20-100 lapis aman).
 *
 * Memilih workflow aktif untuk `Quotation` dengan prioritas tertinggi —
 * pilihan yang sama dengan `requestApprovalIfConfigured`
 * (approval-workflow.service.ts) — lalu menilai ambang langkahnya lewat
 * builder murni `quotation-approval-gate.ts`. Tanpa mutasi, tanpa jurnal:
 * hasil hanya penanda tampil; dokumen TIDAK ditahan.
 */

import { prisma } from "@/lib/db/prisma"
import {
  evaluateQuotationApprovalGate,
  type QuotationApprovalGate,
} from "@/lib/reports/quotation-approval-gate"

export async function loadQuotationApprovalGate(
  quotation: { subtotal: unknown; discount: unknown; grandTotal: unknown },
): Promise<QuotationApprovalGate> {
  const workflow = await prisma.approvalWorkflow.findFirst({
    where: { modelType: "Quotation", isActive: true, deletedAt: null },
    orderBy: [{ priority: "desc" }, { id: "asc" }],
    select: {
      steps: {
        orderBy: { stepOrder: "asc" },
        select: { stepOrder: true, name: true, conditions: true },
      },
    },
  })

  return evaluateQuotationApprovalGate(
    {
      subtotal: Number(quotation.subtotal),
      discount: Number(quotation.discount),
      grandTotal: Number(quotation.grandTotal),
    },
    workflow?.steps ?? [],
  )
}
