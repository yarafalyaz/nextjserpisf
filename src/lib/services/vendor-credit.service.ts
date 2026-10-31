/**
 * Lanjutan R8-JB-03: kredit vendor dari kelebihan relief retur beli.
 *
 * Jurnal retur beli sudah mendebit Hutang Usaha PENUH sebesar harga
 * retur, tetapi relief subledger (balanceDue) capped di total bill
 * terbuka PO — kelebihan di atas itu dulunya hilang diam-diam: GL turun
 * penuh, subledger hanya sebagian, vendor punya kredit tak tercatat.
 * Kelebihan kini dicatat sebagai VendorCredit (cermin CustomerCredit
 * sisi jual) dan diterapkan otomatis FIFO tertua ke bill vendor yang
 * sama saat confirm berikutnya.
 *
 * TIDAK ada jurnal lahir/alokasi: kredit ini subledger atas akun AP
 * yang sama (jurnal retur Dr AP sudah benar). Beda dari sisi jual, di
 * mana kredit lahir di akun kewajiban UMP (210102) yang terpisah dari
 * Piutang sehingga alokasi wajib jurnal reklas Dr UMP / Cr Piutang.
 * Membuat Dr AP / Cr AP di sini akan nol-net dan hanya menambah noise.
 */
import type { TxClient } from "@/lib/db/prisma";
import { SETTLEMENT_TOLERANCE_IDR } from "@/lib/finance/settlement-status";
import { safeAdd, safeSubtract, type SafeMathInput } from "@/lib/utils/math";

export function vendorCreditBalance(credit: {
  receivedAmount: SafeMathInput;
  allocatedAmount: SafeMathInput;
}): number {
  return safeSubtract(credit.receivedAmount, credit.allocatedAmount, 2);
}

/**
 * Terapkan kredit open vendor (FIFO tertua) ke bill yang baru diposting.
 * Dipanggil dalam tx confirm sesudah balanceDue lahir. Mengembalikan
 * sisa balanceDue bill sesudah kredit. paidAmount TIDAK disentuh —
 * kredit bukan pembayaran kas; status mengikuti sisa operasional.
 */
export async function applyOpenVendorCreditsToBill(
  tx: TxClient,
  input: { vendorId: number; billId: number; balanceDue: number },
): Promise<{ remainingBalanceDue: number; appliedTotal: number }> {
  let remaining = safeSubtract(input.balanceDue, 0, 2);
  let appliedTotal = 0;
  if (remaining <= SETTLEMENT_TOLERANCE_IDR) {
    return { remainingBalanceDue: remaining, appliedTotal };
  }
  // Serialisasi per vendor: kunci baris kredit open sebelum dibaca. Tanpa
  // kunci, dua confirm bill vendor yang sama sama-sama membaca
  // allocatedAmount basi dan menulis nilai absolut yang sama — kredit
  // terpakai ganda, subledger AP lepas dari GL. Urutan kunci global:
  // bill (pemanggil) lalu kredit. Guard typeof: tx stub tanpa $executeRaw.
  if (typeof tx.$executeRaw === "function") {
    await tx.$executeRaw`SELECT id FROM vendor_credits WHERE vendor_id = ${input.vendorId} AND status = 'open' FOR UPDATE`;
  }
  const credits = await tx.vendorCredit.findMany({
    where: { vendorId: input.vendorId, status: "open" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, receivedAmount: true, allocatedAmount: true },
  });
  for (const credit of credits) {
    if (remaining <= SETTLEMENT_TOLERANCE_IDR) break;
    const creditBalance = vendorCreditBalance(credit);
    if (!(creditBalance > 0)) continue;
    const applied = Math.min(remaining, creditBalance);
    const newAllocated = safeAdd(credit.allocatedAmount, applied, 2);
    await tx.vendorCredit.update({
      where: { id: credit.id },
      data: {
        allocatedAmount: newAllocated,
        status: vendorCreditBalance({
          receivedAmount: credit.receivedAmount,
          allocatedAmount: newAllocated,
        }) <= SETTLEMENT_TOLERANCE_IDR
          ? "used"
          : "open",
      },
    });
    appliedTotal = safeAdd(appliedTotal, applied, 2);
    remaining = safeSubtract(remaining, applied, 2);
  }
  if (appliedTotal > 0) {
    await tx.vendorBill.update({
      where: { id: input.billId },
      data: {
        balanceDue: remaining,
        status: remaining <= SETTLEMENT_TOLERANCE_IDR ? "paid" : "partial",
      },
    });
  }
  return { remainingBalanceDue: remaining, appliedTotal };
}
