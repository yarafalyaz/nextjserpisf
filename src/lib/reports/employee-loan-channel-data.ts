/**
 * Loader kanal pengajuan pinjaman (F-2026-10-25-018-S, Q-LS-3b).
 *
 * Memetakan `createdBy` (user id) → employeeId tertaut user itu dalam SATU
 * query massal, lalu menurunkan kanal tiap baris lewat builder murni
 * `employee-loan-channel.ts`. Baca-saja: tidak menulis EmployeeLoan/User/
 * Employee apa pun. Baris pinjaman dilewatkan pemanggil (daftar yang sudah
 * ter-scope); loader ini tidak membaca daftar pinjaman sendiri supaya scope
 * HR pemanggil tetap satu-satunya gerbang visibilitas.
 */

import { prisma } from "@/lib/db/prisma"
import {
  employeeLoanChannel,
  type EmployeeLoanChannel,
} from "@/lib/reports/employee-loan-channel"

export interface EmployeeLoanChannelRow {
  id: number
  employeeId: number
  createdBy: number | null
}

export async function loadEmployeeLoanChannels(
  loans: readonly EmployeeLoanChannelRow[],
): Promise<Map<number, EmployeeLoanChannel>> {
  const creatorIds = [
    ...new Set(
      loans
        .map((loan) => loan.createdBy)
        .filter((id): id is number => id != null),
    ),
  ]
  const creators =
    creatorIds.length > 0
      ? await prisma.employee.findMany({
          where: { userId: { in: creatorIds } },
          select: { id: true, userId: true },
        })
      : []
  const employeeByUserId = new Map<number, number>()
  for (const creator of creators) {
    if (creator.userId != null) employeeByUserId.set(creator.userId, creator.id)
  }

  const channels = new Map<number, EmployeeLoanChannel>()
  for (const loan of loans) {
    channels.set(
      loan.id,
      employeeLoanChannel({
        employeeId: loan.employeeId,
        creatorEmployeeId:
          loan.createdBy == null
            ? null
            : (employeeByUserId.get(loan.createdBy) ?? null),
      }),
    )
  }
  return channels
}
