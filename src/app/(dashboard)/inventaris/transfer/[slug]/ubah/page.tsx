 
export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import { InventoryTransferForm } from "@/components/forms/inventory-transfer-form";
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs";

import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth/permissions";
import { resolveEntity } from "@/lib/utils/resolve-entity";
export const metadata: Metadata = { title: "Ubah Transfer Stok" };

export default async function EditPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requirePermission("edit_inventory_transfers");

  const { slug } = await params;

  const data = await resolveEntity(
    { segment: slug },
    {
      bySlug: (s) =>
        prisma.inventoryTransfer.findFirst({
          where: { slug: s },
          include: { items: { select: { itemId: true, qty: true } } },
        }),
      byId: (id) =>
        prisma.inventoryTransfer.findUnique({
          where: { id },
          include: { items: { select: { itemId: true, qty: true } } },
        }),
    },
  );

  if (!data) notFound();

  const transfer = {
    ...data,
    items: data.items.map((it) => ({ itemId: it.itemId, qty: Number(it.qty) })),
  };

  const [warehouses, items] = await Promise.all([
    prisma.warehouse.findMany({ orderBy: { name: "asc" } }),
    prisma.item
      .findMany({
        where: { isActive: true, deletedAt: null },
        orderBy: { name: "asc" },
        select: {
          id: true,
          sku: true,
          name: true,
          qtyOnHand: true,
          cost: true,
        },
      })
      .then((items) =>
        items.map((i) => ({
          ...i,
          qtyOnHand: String(i.qtyOnHand),
          cost: String(i.cost),
        })),
      ),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Inventaris", href: "/inventaris/transfer" },
          { label: "Ubah" },
        ]}
      />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah</h1>
      </div>
      <InventoryTransferForm
        transfer={transfer as any}
        warehouses={warehouses as any}
        items={items as any}
      />
    </div>
  );
}
