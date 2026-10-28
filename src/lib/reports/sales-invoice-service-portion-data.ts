/**
 * Read-model porsi jasa-vs-barang per faktur penjualan (SERIALIZABLE,
 * UI read-only) — F-2026-10-28-137-V V1/V1a (SAL-BR-013).
 *
 * Definisi baris jasa VERBATIM dari vonis (V1a FINAL): itemId null (teks
 * bebas) ATAU item ter-resolve isProduct=false. isService TIDAK dipakai
 * sebagai penentu. Loader menghitung porsi di server supaya UI hanya
 * menempelkan strip read-only + banner "atur di Pengaturan → Akun" bila
 * faktur berjasa tetapi akun jasa belum dipetakan — UI dilarang hitung ulang.
 *
 * Baca-saja mutlak: tanpa postInvoice/assertApproved, tanpa tulis jurnal/
 * status/kolom. Izin `view_sales_invoices` ditegakkan fail-closed sebelum
 * query apa pun (pola sales-invoice-draft-queue-data.ts).
 */

import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/auth/permissions";
import { safeAdd } from "@/lib/utils/math";

export interface SalesInvoiceServicePortion {
  invoiceId: number;
  /** Σ total baris jasa (itemId null ATAU item isProduct=false), sen-persis. */
  serviceSubtotal: number;
  /** Σ total baris barang (item ter-resolve isProduct=true + orphan), sen-persis. */
  goodsSubtotal: number;
  /** True bila ≥1 baris fisik memenuhi definisi jasa V1a. */
  hasServiceLines: boolean;
  /** True bila settings.salesServiceRevenueAccountId terisi. */
  serviceRevenueAccountConfigured: boolean;
  /** Nama akun jasa bila terpetakan (null bila belum). */
  serviceRevenueAccountName: string | null;
}

export function splitInvoiceServicePortion(
  lines: Array<{ itemId: number | null; qty: unknown; total: unknown }>,
  productByItemId: Map<number, boolean>,
): { serviceSubtotal: number; goodsSubtotal: number; hasServiceLines: boolean } {
  let serviceSubtotal = 0;
  let goodsSubtotal = 0;
  let hasServiceLines = false;
  for (const line of lines) {
    if (Number(line.qty) <= 0) continue;
    const total = Number(line.total ?? 0);
    if (typeof line.itemId !== "number") {
      serviceSubtotal = safeAdd(serviceSubtotal, total, 2);
      hasServiceLines = true;
    } else if (productByItemId.get(line.itemId) === false) {
      serviceSubtotal = safeAdd(serviceSubtotal, total, 2);
      hasServiceLines = true;
    } else {
      // isProduct=true ATAU item orphan (terhapus) = porsi barang — cermin
      // perlakuan jalur posting (orphan tidak memicu gate akun jasa).
      goodsSubtotal = safeAdd(goodsSubtotal, total, 2);
    }
  }
  return { serviceSubtotal, goodsSubtotal, hasServiceLines };
}

export async function getSalesInvoiceServicePortion(
  invoiceId: number,
): Promise<SalesInvoiceServicePortion> {
  await requirePermission("view_sales_invoices");

  const invoice = await prisma.salesInvoice.findUniqueOrThrow({
    where: { id: invoiceId },
    select: {
      id: true,
      items: {
        select: { itemId: true, qty: true, total: true },
      },
    },
  });

  const itemIds = [
    ...new Set(
      invoice.items
        .map((it) => it.itemId)
        .filter((id): id is number => typeof id === "number"),
    ),
  ];
  const items = itemIds.length
    ? await prisma.item.findMany({
        where: { id: { in: itemIds } },
        select: { id: true, isProduct: true },
      })
    : [];
  const productByItemId = new Map(items.map((r) => [r.id, r.isProduct]));

  const { serviceSubtotal, goodsSubtotal, hasServiceLines } =
    splitInvoiceServicePortion(invoice.items, productByItemId);

  const settings = await prisma.systemSetting.findFirst({
    select: { salesServiceRevenueAccountId: true },
  });
  const serviceAccountId = settings?.salesServiceRevenueAccountId ?? null;
  let serviceRevenueAccountName: string | null = null;
  if (serviceAccountId != null) {
    const account = await prisma.account.findUnique({
      where: { id: serviceAccountId },
      select: { name: true },
    });
    serviceRevenueAccountName = account?.name ?? null;
  }

  return {
    invoiceId: invoice.id,
    serviceSubtotal,
    goodsSubtotal,
    hasServiceLines,
    serviceRevenueAccountConfigured: serviceAccountId != null,
    serviceRevenueAccountName,
  };
}
