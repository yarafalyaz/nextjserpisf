export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import { PurchaseReturnForm } from "@/components/forms/purchase-return-form";
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs";

import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth/permissions";
import { resolveEntity } from "@/lib/utils/resolve-entity";
export const metadata: Metadata = { title: "Ubah Retur" };

export default async function EditPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requirePermission("edit_purchase_returns");

  const { slug } = await params;

  const includeDetail = {
    items: {
      select: { itemId: true, qty: true, goodsReceiptItemId: true },
      orderBy: { id: "asc" as const },
    },
  };
  const data = await resolveEntity(
    { segment: slug, fallbackWhere: {} },
    {
      bySlug: (s, where) => prisma.purchaseReturn.findFirst({ where: { slug: s, ...where }, include: includeDetail }),
      byId: (id, where) => prisma.purchaseReturn.findUnique({ where: { id, ...where }, include: includeDetail }),
    },
  );

  if (!data) notFound();

  const returnData = {
    id: data.id,
    purchaseOrderId: data.purchaseOrderId,
    date: data.date.toISOString().split("T")[0],
    reason: data.reason,
    taxReturnNoteNumber: data.taxReturnNoteNumber,
    taxReturnNoteDate: data.taxReturnNoteDate ? data.taxReturnNoteDate.toISOString().split("T")[0] : null,
    items: data.items.map((it) => ({
      itemId: it.itemId,
      qty: Number(it.qty),
      goodsReceiptItemId: it.goodsReceiptItemId ?? null,
    })),
  };

  const [purchaseOrders, items, receiptLineRows] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where: {
        OR: [
          {
            status: { in: ["received", "partial_received", "verified", "completed", "ordered"] },
            deletedAt: null,
          },
          // Keep currently linked PO visible if it was cancelled after this
          // draft return was created; otherwise Combobox loses its label.
          { id: data.purchaseOrderId },
        ],
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, documentNo: true },
    }),
    prisma.item.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, sku: true, name: true },
    }),
    // STOK-16: opsi baris penerimaan asal untuk picker per baris retur.
    prisma.goodsReceiptItem.findMany({
      where: {
        goodsReceipt: {
          purchaseOrderId: data.purchaseOrderId,
          status: { in: ["verified", "completed"] },
        },
      },
      select: {
        id: true,
        itemId: true,
        qty: true,
        uom: true,
        batchNumber: true,
        goodsReceipt: {
          select: { documentNo: true, purchaseOrderId: true, createdAt: true },
        },
      },
      orderBy: { goodsReceipt: { createdAt: "desc" } },
      take: 1000,
    }),
  ]);
  const receiptLines = receiptLineRows.map((l) => ({
    id: l.id,
    purchaseOrderId: l.goodsReceipt.purchaseOrderId,
    itemId: l.itemId,
    qty: Number(l.qty),
    uom: l.uom,
    batchNumber: l.batchNumber,
    label: `${l.goodsReceipt.documentNo} — ${Number(l.qty)}${l.uom ? ` ${l.uom}` : ""}${l.batchNumber ? ` — batch ${l.batchNumber}` : ""} — ${l.goodsReceipt.createdAt.toISOString().slice(0, 10)}`,
  }));

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Pembelian", href: "/pembelian" },
          { label: "Retur", href: "/pembelian/retur" },
          { label: "Ubah" },
        ]}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Ubah</h1>
      </div>
      <PurchaseReturnForm
        returnData={returnData}
        purchaseOrders={purchaseOrders}
        items={items}
        receiptLines={receiptLines}
      />
    </div>
  );
}
