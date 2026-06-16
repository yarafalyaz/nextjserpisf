export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import { GoodsReceiptForm } from "@/components/forms/goods-receipt-form";
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs";

import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth/permissions";
export const metadata: Metadata = { title: "Ubah Penerimaan Barang" };

export default async function EditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("edit_purchase_orders");

  const { id } = await params;
  const numId = Number(id);
  if (Number.isNaN(numId)) notFound();

  const data = await prisma.goodsReceipt.findUnique({
    where: { id: numId },
    // The form's edit mode needs the existing received lines — without this
    // include, the form would re-derive line items from the PO and silently
    // wipe the original qty/unitCost/batch/serial data on save.
    include: { items: true },
  });

  if (!data) notFound();

  const receipt = {
    id: data.id,
    purchaseOrderId: data.purchaseOrderId,
    warehouseId: data.warehouseId,
    date: data.date.toISOString().split("T")[0],
    notes: data.notes,
    items: data.items.map((it) => ({
      itemId: it.itemId,
      qty: Number(it.qty),
      unitCost: Number(it.unitCost),
      batchNumber: it.batchNumber ?? "",
      expiryDate: it.expiryDate ? it.expiryDate.toISOString().split("T")[0] : "",
      serialNumbers: Array.isArray(it.serialNumbers)
        ? it.serialNumbers.join("\n")
        : "",
      warehouseId: it.warehouseId,
    })),
  };

  const [purchaseOrders, warehouses, itemRecords] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where: {
        status: { in: ["approved", "ordered", "partial_received", "received"] },
      },
      orderBy: { createdAt: "desc" },
      include: { vendor: { select: { name: true } }, items: true },
    }),
    prisma.warehouse.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
    }),
    prisma.item.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        sku: true,
        trackBatch: true,
        trackSerial: true,
        unitOfMeasure: true,
        uomConversions: { select: { code: true, factorToBase: true } },
      },
    }),
  ]);

  const itemMap = new Map(
    itemRecords.map((i) => [
      i.id,
      {
        name: i.name,
        sku: i.sku,
        trackBatch: i.trackBatch,
        trackSerial: i.trackSerial,
        unitOfMeasure: i.unitOfMeasure,
        uomConversions: i.uomConversions.map((u) => ({
          code: u.code,
          factorToBase: Number(u.factorToBase),
        })),
      },
    ]),
  );

  const purchaseOrderOptions = purchaseOrders.map((po) => ({
    id: po.id,
    documentNo: po.documentNo,
    vendor: po.vendor ? { name: po.vendor.name } : undefined,
    items: po.items.map((item) => ({
      id: item.id,
      itemId: item.itemId,
      qty: Number(item.qty),
      unitPrice: Number(item.unitPrice),
      receivedQty: Number(item.receivedQty),
      item: itemMap.get(item.itemId) ?? {
        name: "",
        sku: "",
        trackBatch: false,
        trackSerial: false,
        unitOfMeasure: "PCS",
        uomConversions: [],
      },
    })),
  }));

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Pembelian", href: "/pembelian" },
          { label: "Penerimaan Barang", href: "/pembelian/penerimaan" },
          { label: "Ubah" },
        ]}
      />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah</h1>
      </div>
      <GoodsReceiptForm
        receipt={receipt}
        purchaseOrders={purchaseOrderOptions}
        warehouses={warehouses}
      />
    </div>
  );
}
