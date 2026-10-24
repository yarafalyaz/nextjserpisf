/**
 * F-2026-10-23-104-V Putusan 2 (BR-RET-02): returnCredit per faktur asal.
 *
 * Satu-satunya derivation: Σ kaki Cr akun Piutang (`salesReceivableAccountId`)
 * jurnal SalesReturn POSTED tidak-terhapus atas SalesReturn `completed`
 * ber-`salesInvoiceId` faktur itu. Jurnal REVERSED tidak dihitung (filter
 * status POSTED). `paidAmount` kolom TIDAK pernah diubah helper ini —
 * definisi pembayaran tetap murni (vonis); outstanding baru =
 * grandTotal − paidAmount − returnCredit.
 *
 * Akun Piutang belum terkonfigurasi / settings gagal → semua 0 (pola
 * sales-target-achievement-data): laporan tetap jalan, retur tidak tampil
 * sebagai pengurang. Dipakai bersama loader statement, aging, ringkasan
 * AR/AP, dan antrean penagihan — jangan salin-tempel query jurnal.
 */

import { prisma } from "@/lib/db/prisma"
import { getSystemSettings } from "@/lib/utils/settings"
import { safeAdd } from "@/lib/utils/math"

/**
 * Map salesReturnId → returnCredit retur itu (Rp, presisi sen), dari kaki
 * Cr Piutang jurnal SalesReturn POSTED retur tersebut. Retur tanpa jurnal
 * POSTED tidak muncul di map (anggap 0).
 */
export async function loadReturnCreditByReturnId(
  returnIds: readonly number[],
): Promise<Map<number, number>> {
  const result = new Map<number, number>()
  if (returnIds.length === 0) return result

  let receivableAccountId: number | null = null
  try {
    receivableAccountId = (await getSystemSettings())?.salesReceivableAccountId ?? null
  } catch {
    receivableAccountId = null
  }
  if (receivableAccountId === null) return result

  const journals = await prisma.journal.findMany({
    where: {
      deletedAt: null,
      status: "POSTED",
      referenceType: "SalesReturn",
      referenceId: { in: [...returnIds] },
    },
    select: {
      referenceId: true,
      entries: {
        where: { accountId: receivableAccountId },
        select: { credit: true },
      },
    },
  })
  for (const journal of journals) {
    if (journal.referenceId === null) continue
    let credit = 0
    for (const entry of journal.entries) credit = safeAdd(credit, Number(entry.credit), 2)
    if (credit <= 0) continue
    result.set(journal.referenceId, safeAdd(result.get(journal.referenceId) ?? 0, credit, 2))
  }
  return result
}

/**
 * Map salesInvoiceId → returnCredit total (Rp, presisi sen).
 * Faktur tanpa retur POSTED tidak muncul di map (anggap 0).
 */
export async function loadReturnCreditByInvoiceId(
  invoiceIds: readonly number[],
): Promise<Map<number, number>> {
  const result = new Map<number, number>()
  if (invoiceIds.length === 0) return result

  const returns = await prisma.salesReturn.findMany({
    where: { status: "completed", salesInvoiceId: { in: [...invoiceIds] } },
    select: { id: true, salesInvoiceId: true },
  })
  if (returns.length === 0) return result

  const invoiceByReturnId = new Map(returns.map((r) => [r.id, r.salesInvoiceId as number]))
  const byReturnId = await loadReturnCreditByReturnId(returns.map((r) => r.id))
  for (const [returnId, credit] of byReturnId) {
    const invoiceId = invoiceByReturnId.get(returnId)
    if (invoiceId === undefined) continue
    result.set(invoiceId, safeAdd(result.get(invoiceId) ?? 0, credit, 2))
  }
  return result
}
