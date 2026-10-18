export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import { DeliveryOrderForm } from "@/components/forms/delivery-order-form";
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs";

import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth/permissions";
import { resolveEntity } from "@/lib/utils/resolve-entity";
import { DELIVERABLE_ORDER_STATUSES } from "@/lib/validations/sales.schemas";
export const metadata: Metadata = { title: "Ubah Surat Jalan" };

export default async function EditPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requirePermission("edit_delivery_orders");

  const { slug } = await params

  const data = await resolveEntity(
    { segment: slug, fallbackWhere: {} },
    {
      bySlug: (s, where) =>
        prisma.deliveryOrder.findFirst({
          where: { slug: s, ...where },
          include: { items: { orderBy: { id: "asc" }, include: { item: { select: { name: true } } } } },
        }),
      byId: (id, where) =>
        prisma.deliveryOrder.findUnique({
          where: { id, ...where },
          include: { items: { orderBy: { id: "asc" }, include: { item: { select: { name: true } } } } },
        }),
    },
  );

  if (!data) notFound();

  const deliveryOrder = {
    id: data.id,
    salesOrderId: data.salesOrderId,
    date: data.date.toISOString().split("T")[0],
    doNumber: data.doNumber,
    deliveryDate: data.deliveryDate?.toISOString().split("T")[0] ?? null,
    notes: data.notes,
    shippingAddress: data.shippingAddress,
    shippingProvince: data.shippingProvince,
    shippingCity: data.shippingCity,
    shippingDistrict: data.shippingDistrict,
    shippingVillage: data.shippingVillage,
    shippingPostalCode: data.shippingPostalCode,
    shippingPhone: data.shippingPhone,
    vehicleNumber: data.vehicleNumber,
    // Baris barang ditampilkan apa adanya (tidak disunting di sini): mengubah
    // baris surat jalan yang sudah jalan akan memutus hitungan Pemenuhan Pesanan.
    items: data.items.map((item) => ({
      itemId: item.itemId,
      qty: Number(item.qty),
      description: item.item.name,
    })),
  };

  const salesOrders = await prisma.salesOrder.findMany({
    where: { status: { in: [...DELIVERABLE_ORDER_STATUSES] } },
    orderBy: { createdAt: "desc" },
    include: { customer: { select: { name: true } } },
  });

  const salesOrderOptions = salesOrders.map((so) => ({
    id: so.id,
    documentNo: so.documentNo,
    customer: { name: so.customer.name },
  }));

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Surat Jalan", href: "/penjualan/surat-jalan" },
          { label: "Ubah" },
        ]}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Ubah</h1>
      </div>
      <DeliveryOrderForm
        deliveryOrder={deliveryOrder}
        salesOrders={salesOrderOptions}
      />
    </div>
  );
}
