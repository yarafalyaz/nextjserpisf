export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import { SalesOrderForm } from "@/components/forms/sales-order-form";
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
  await requirePermission("edit_sales_orders");

  const { slug } = await params;

  const data = await resolveEntity(
    { segment: slug, fallbackWhere: {} },
    {
      bySlug: (s, where) => prisma.salesOrder.findFirst({ where: { slug: s, ...where } }),
      byId: (id, where) => prisma.salesOrder.findUnique({ where: { id, ...where } }),
    },
  );

  if (!data) notFound();

  const customers = await prisma.customer.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Penjualan", href: "/penjualan" },
          { label: "Pesanan", href: "/penjualan/pesanan" },
          { label: "Ubah" },
        ]}
      />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah</h1>
      </div>
      <SalesOrderForm
        order={{
          id: data.id,
          customerId: data.customerId,
          date: data.date.toISOString().split("T")[0],
          notes: data.notes,
        }}
        customers={customers}
      />
    </div>
  );
}
