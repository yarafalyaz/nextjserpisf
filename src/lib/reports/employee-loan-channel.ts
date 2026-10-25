/**
 * F-2026-10-25-018-S — kanal pengajuan pinjaman + kosakata status EmployeeLoan.
 *
 * Putusan Lead F-2026-10-25-026-L:
 * - Q-LS-3b: kanal pengajuan (mandiri vs titipan) adalah TURUNAN BACA dari
 *   data existing tahap 1 — kolom penanda sumber DILARANG. Mandiri ⇔ baris
 *   dibuat oleh user yang employee-tertautnya = `employeeId` pinjaman
 *   (pemetaan user→employee yang sama dengan scope self `getHrScope`);
 *   selain itu = titipan staf. Laporan kanal WAJIB memakai turunan ini dan
 *   dilarang mengklaim kanal dari heuristik lain (mis. peran pembuat).
 * - Q-LS-4: kosakata status EmployeeLoan DITUTUP: `pending` → `active` |
 *   `rejected`; `active` → `paid_off`. Status di luar himpunan ini bukan
 *   status pinjaman yang sah untuk konsumen — tampilkan apa adanya sebagai
 *   tidak dikenal, jangan dipetakan paksa ke status sah.
 *
 * Pure (tanpa Prisma/DOM/izin). Pemanggil (loader Server Component / aksi)
 * yang menyelesaikan employeeId milik user pembuat dari `createdBy`.
 */

/* ------------------------------------------------------------------ */
/* Kosakata status tertutup (Q-LS-4)                                   */
/* ------------------------------------------------------------------ */

export const EMPLOYEE_LOAN_STATUSES = [
  "pending",
  "active",
  "rejected",
  "paid_off",
] as const
export type EmployeeLoanStatus = (typeof EMPLOYEE_LOAN_STATUSES)[number]

/** True hanya untuk status persis dalam kosakata tertutup Q-LS-4. */
export function isEmployeeLoanStatus(
  status: string,
): status is EmployeeLoanStatus {
  return (EMPLOYEE_LOAN_STATUSES as readonly string[]).includes(status)
}

/* ------------------------------------------------------------------ */
/* Kanal pengajuan (Q-LS-3b, turunan baca)                             */
/* ------------------------------------------------------------------ */

export const EMPLOYEE_LOAN_CHANNELS = ["mandiri", "titipan"] as const
export type EmployeeLoanChannel = (typeof EMPLOYEE_LOAN_CHANNELS)[number]

export const EMPLOYEE_LOAN_CHANNEL_LABELS: Record<EmployeeLoanChannel, string> = {
  mandiri: "Pengajuan Mandiri",
  titipan: "Titipan Staf",
}

/**
 * Turunan kanal satu baris pinjaman.
 *
 * @param loan.employeeId  Karyawan pemilik pinjaman.
 * @param creatorEmployeeId Employee tertaut user `createdBy` pinjaman,
 *   atau null bila pembuat tidak tertaut karyawan mana pun (termasuk
 *   `createdBy` kosong / user staf tanpa baris employee).
 *
 * Mandiri hanya bila pembuat tertaut TEPAT ke karyawan pemilik pinjaman.
 * Pembuat tanpa tautan tidak pernah bisa dibuktikan mandiri → titipan.
 */
export function employeeLoanChannel(loan: {
  employeeId: number
  creatorEmployeeId: number | null
}): EmployeeLoanChannel {
  return loan.creatorEmployeeId != null &&
    loan.creatorEmployeeId === loan.employeeId
    ? "mandiri"
    : "titipan"
}
