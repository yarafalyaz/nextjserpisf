export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import { PurchaseOrderForm } from "@/components/forms/purchase-order-form";
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs";

import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth/permissions";
import { resolveEntity } from "@/lib/utils/resolve-entity";
export const metadata: Metadata = { title: "Ubah Pesanan" };

export default async function EditPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requirePermission("edit_purchase_orders");

  const { slug } = await params;

  const data = await resolveEntity(
    { segment: slug, fallbackWhere: {} },
    {
      bySlug: (s, where) =>
        prisma.purchaseOrder.findFirst({
          where: { slug: s, ...where },
          include: {
            items: {
              select: { itemId: true, qty: true, unitPrice: true, discount: true },
            },
          },
        }),
      byId: (id, where) =>
        prisma.purchaseOrder.findUnique({
          where: { id, ...where },
          include: {
            items: {
              select: { itemId: true, qty: true, unitPrice: true, discount: true },
            },
          },
        }),
    },
  );

  if (!data) notFound();

  const order = {
    id: data.id,
    vendorId: data.vendorId,
    date: data.date.toISOString().split("T")[0],
    notes: data.notes,
    paymentTerm: data.paymentTerm,
    purchaseRequestId: data.purchaseRequestId,
    expectedDate: data.expectedDate ? data.expectedDate.toISOString().split("T")[0] : null,
    shippingCost: Number(data.shippingCost),
    serviceFee: Number(data.serviceFee),
    items: data.items.map((it) => ({
      itemId: it.itemId,
      qty: Number(it.qty),
      unitPrice: Number(it.unitPrice),
      discount: Number(it.discount),
    })),
  };

  const [vendors, items] = await Promise.all([
    prisma.vendor.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, paymentTerm: { select: { name: true, code: true, days: true } } },
    }),
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
          { label: "Pesanan Pembelian", href: "/pembelian/pesanan" },
          { label: "Ubah" },
        ]}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Ubah</h1>
      </div>
      <PurchaseOrderForm order={order} vendors={vendors} items={items} />
    </div>
  );
}
