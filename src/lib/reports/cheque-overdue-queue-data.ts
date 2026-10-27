/**
 * Loader baca-saja antrean giro/cek pending lewat jatuh tempo
 * (F-2026-10-27-104-S, 104-B+F).
 *
 * Fail-closed SEBELUM query (BR-CQ-09, PUTUSAN LEAD Q-CQ-3): izin
 * `view_cheques` — key yang sama dengan register giro existing, tanpa
 * key baru — ditegakkan di sini sebelum query apa pun.
 *
 * Baca-saja mutlak (BR-CQ-07): loader hanya `findMany`; tidak memanggil
 * aksi tulis giro existing dan tidak menulis kolom apa pun.
 * Populasi/ember/tingkat/umur/rekap/potongan di builder murni
 * `cheque-overdue-queue.ts`. Semua status diambil dan disaring di
 * builder supaya aturan populasi tinggal di satu tempat (pola loader
 * laporan giro mundur existing).
 */

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import {
  buildChequeOverdueQueue,
  type ChequeOverdueInput,
  type ChequeOverdueQueue,
} from "@/lib/reports/cheque-overdue-queue"

export interface ChequeOverdueQueueOptions {
  asOf?: Date
  limit?: number
}

export async function getChequeOverdueQueue(
  options: ChequeOverdueQueueOptions = {},
): Promise<ChequeOverdueQueue> {
  await requirePermission("view_cheques")

  const cheques = await prisma.cheque.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      documentNo: true,
      type: true,
      direction: true,
      number: true,
      party: true,
      amount: true,
      dueDate: true,
      status: true,
      deletedAt: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [{ dueDate: "asc" }, { documentNo: "asc" }, { id: "asc" }],
  })

  const inputs: ChequeOverdueInput[] = cheques.map((cheque) => ({
    chequeId: cheque.id,
    documentNo: cheque.documentNo,
    type: cheque.type,
    direction: cheque.direction,
    number: cheque.number,
    party: cheque.party,
    amount: Number(cheque.amount),
    dueDate: cheque.dueDate,
    status: cheque.status,
    deletedAt: cheque.deletedAt,
    createdAt: cheque.createdAt,
    updatedAt: cheque.updatedAt,
  }))

  return buildChequeOverdueQueue(inputs, options.asOf ?? new Date(), options.limit)
}
