export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import { WorkOrderForm } from "@/components/forms/work-order-form";
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs";

import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth/permissions";
export const metadata: Metadata = { title: "Ubah Perintah Kerja" };

export default async function EditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("edit_production");

  const { id } = await params;
  const numId = Number(id);
  if (Number.isNaN(numId)) notFound();

  const data = await prisma.workOrder.findUnique({
    where: { id: numId },
    include: {
      items: {
        select: {
          itemId: true,
          qty: true,
          cost: true,
          description: true,
          status: true,
        },
      },
    },
  });

  if (!data) notFound();

  const workOrder = {
    id: data.id,
    customerId: data.customerId,
    quotationId: data.quotationId,
    projectId: data.projectId,
    date: data.date.toISOString().split("T")[0],
    notes: data.notes,
    items: data.items.map((it) => ({
      itemId: it.itemId,
      qty: Number(it.qty),
      cost: Number(it.cost),
      description: it.description ?? "",
      status: it.status,
    })),
  };

  const [customers, items] = await Promise.all([
    prisma.customer.findMany({ orderBy: { name: "asc" } }),
    prisma.item
      .findMany({
        where: { isActive: true, deletedAt: null },
        orderBy: { name: "asc" },
        select: { id: true, sku: true, name: true, cost: true },
      })
      .then((items) => items.map((i) => ({ ...i, cost: String(i.cost) }))),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Manufaktur", href: "/produksi/perintah-kerja" },
          { label: "Ubah" },
        ]}
      />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah</h1>
      </div>
      <WorkOrderForm
        workOrder={workOrder}
        customers={customers}
        items={items}
      />
    </div>
  );
}
