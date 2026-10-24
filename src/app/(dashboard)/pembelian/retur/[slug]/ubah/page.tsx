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

  const data = await resolveEntity(
    { segment: slug, fallbackWhere: {} },
    {
      bySlug: (s, where) => prisma.purchaseReturn.findFirst({ where: { slug: s, ...where } }),
      byId: (id, where) => prisma.purchaseReturn.findUnique({ where: { id, ...where } }),
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
  };

  const [purchaseOrders, items] = await Promise.all([
    prisma.purchaseOrder.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, documentNo: true },
    }),
    prisma.item.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, sku: true, name: true },
    }),
  ]);

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
      />
    </div>
  );
}
