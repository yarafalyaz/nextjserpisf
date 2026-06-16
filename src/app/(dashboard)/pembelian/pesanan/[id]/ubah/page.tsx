export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import { PurchaseOrderForm } from "@/components/forms/purchase-order-form";
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs";

import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth/permissions";
export const metadata: Metadata = { title: "Ubah Pesanan" };

export default async function EditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("edit_purchase_orders");

  const { id } = await params;
  const numId = Number(id);
  if (Number.isNaN(numId)) notFound();

  const data = await prisma.purchaseOrder.findUnique({
    where: { id: numId },
    include: {
      items: {
        select: { itemId: true, qty: true, unitPrice: true, discount: true },
      },
    },
  });

  if (!data) notFound();

  const order = {
    id: data.id,
    vendorId: data.vendorId,
    date: data.date.toISOString().split("T")[0],
    notes: data.notes,
    items: data.items.map((it) => ({
      itemId: it.itemId,
      qty: Number(it.qty),
      unitPrice: Number(it.unitPrice),
      discount: Number(it.discount),
    })),
  };

  const [vendors, items] = await Promise.all([
    prisma.vendor.findMany({ orderBy: { name: "asc" } }),
    prisma.item
      .findMany({
        where: { isActive: true, deletedAt: null },
        orderBy: { name: "asc" },
        select: {
          id: true,
          sku: true,
          name: true,
          cost: true,
          unitOfMeasure: true,
        },
      })
      .then((items) => items.map((i) => ({ ...i, cost: String(i.cost) }))),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Pembelian", href: "/pembelian" },
          { label: "Pesanan", href: "/pembelian/pesanan" },
          { label: "Ubah" },
        ]}
      />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah</h1>
      </div>
      <PurchaseOrderForm order={order} vendors={vendors} items={items} />
    </div>
  );
}
