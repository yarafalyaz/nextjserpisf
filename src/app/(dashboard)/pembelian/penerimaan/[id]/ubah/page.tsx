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
  await requirePermission("edit_goods_receipts");

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
    referenceNumber: data.referenceNumber,
    notes: data.notes,
    shippingCost: Number(data.shippingCost),
    otherCost: Number(data.otherCost),
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
      rackId: it.rackId,
      rackRowId: it.rackRowId,
    })),
  };

  const [purchaseOrders, warehouses, racks, rackRows, itemRecords] = await Promise.all([
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
    prisma.rack.findMany({
      orderBy: { name: "asc" },
      select: { id: true, warehouseId: true, name: true, code: true },
    }),
    prisma.rackRow.findMany({
      orderBy: { name: "asc" },
      select: { id: true, rackId: true, name: true, code: true },
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
        defaultWarehouseId: true,
        defaultRackId: true,
        defaultRackRowId: true,
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
        defaultWarehouseId: i.defaultWarehouseId,
        defaultRackId: i.defaultRackId,
        defaultRackRowId: i.defaultRackRowId,
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
    shippingCost: Number(po.shippingCost),
    serviceFee: Number(po.serviceFee),
    discount: Number(po.discount),
    items: po.items.map((item) => ({
      id: item.id,
      itemId: item.itemId,
      qty: Number(item.qty),
      unitPrice: Number(item.unitPrice),
      total: Number(item.total),
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
        racks={racks}
        rackRows={rackRows}
      />
    </div>
  );
}
