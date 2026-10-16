/**
 * Pemuatan data untuk laporan **Giro Mundur (Belum Jatuh Tempo)**.
 *
 * Membaca register giro/cek yang belum dihapus. Baris `cleared`/`cancelled` tetap
 * diambil dan disaring di builder supaya aturan "hanya pending" tinggal di satu
 * tempat (pure/teruji).
 */

import { prisma } from "@/lib/db/prisma"
import {
  buildPostDatedCheques,
  type ChequeInput,
  type PostDatedChequesResult,
} from "@/lib/reports/post-dated-cheques"

export interface PostDatedChequesReport {
  report: PostDatedChequesResult
  asOf: Date
}

export async function loadPostDatedCheques(asOf: Date): Promise<PostDatedChequesReport> {
  const cheques = await prisma.cheque.findMany({
    where: { deletedAt: null },
    orderBy: { dueDate: "asc" },
  })

  const accountIds = [...new Set(cheques.map((cheque) => cheque.accountId).filter((id): id is number => id !== null))]
  const accounts = accountIds.length
    ? await prisma.account.findMany({
        where: { id: { in: accountIds } },
        select: { id: true, code: true, name: true },
      })
    : []
  const accountById = new Map(accounts.map((account) => [account.id, account]))

  const inputs: ChequeInput[] = cheques.map((cheque) => {
    const account = cheque.accountId ? accountById.get(cheque.accountId) : undefined
    return {
      documentNo: cheque.documentNo,
      type: cheque.type,
      direction: cheque.direction,
      number: cheque.number,
      party: cheque.party,
      accountLabel: account ? `${account.code} ${account.name}` : null,
      amount: Number(cheque.amount),
      dueDate: cheque.dueDate,
      status: cheque.status,
    }
  })

  return { report: buildPostDatedCheques({ cheques: inputs, asOf }), asOf }
}
