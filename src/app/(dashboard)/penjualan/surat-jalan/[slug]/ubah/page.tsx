export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import { DeliveryOrderForm } from "@/components/forms/delivery-order-form";
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs";

import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth/permissions";
import { resolveEntity } from "@/lib/utils/resolve-entity";
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
      bySlug: (s, where) => prisma.deliveryOrder.findFirst({ where: { slug: s, ...where } }),
      byId: (id, where) => prisma.deliveryOrder.findUnique({ where: { id, ...where } }),
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
  };

  const salesOrders = await prisma.salesOrder.findMany({
    where: { status: { in: ["confirmed", "processing", "completed"] } },
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
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah</h1>
      </div>
      <DeliveryOrderForm
        deliveryOrder={deliveryOrder}
        salesOrders={salesOrderOptions}
      />
    </div>
  );
}
