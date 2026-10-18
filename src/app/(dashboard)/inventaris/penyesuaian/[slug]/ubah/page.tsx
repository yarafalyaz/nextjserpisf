 
export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import { StockAdjustmentForm } from "@/components/forms/stock-adjustment-form";
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs";

import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth/permissions";
import { resolveEntity } from "@/lib/utils/resolve-entity";
import { canViewWarehouseScopedDocument } from "@/lib/auth/document-scope";
export const metadata: Metadata = { title: "Ubah Penyesuaian Stok" };

export default async function EditPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requirePermission("edit_stock_adjustments");

  const { slug } = await params;

  const data = await resolveEntity(
    { segment: slug },
    {
      bySlug: (s) =>
        prisma.stockAdjustment.findFirst({
          where: { slug: s },
          include: {
            items: {
              select: {
                itemId: true,
                systemQty: true,
                actualQty: true,
                unitCost: true,
                notes: true,
                serialNumbers: true,
              },
            },
          },
        }),
      byId: (id) =>
        prisma.stockAdjustment.findUnique({
          where: { id },
          include: {
            items: {
              select: {
                itemId: true,
                systemQty: true,
                actualQty: true,
                unitCost: true,
                notes: true,
                serialNumbers: true,
              },
            },
          },
        }),
    },
  );

  if (!data) notFound();

  // Batas gudang sama dengan lampiran, cetak, dan halaman detail — form ini
  // memuat nilai dokumen, jadi tidak boleh lebih longgar.
  if (!(await canViewWarehouseScopedDocument("stock_adjustment", data.id))) notFound();

  const adjustment = {
    ...data,
    // Sama seperti transfer: normalisasi Date → "YYYY-MM-DD" agar tanggal asli
    // yang dikirim form tidak tertimpa "hari ini".
    date: data.date.toISOString().split("T")[0],
    items: data.items.map((it) => ({
      itemId: it.itemId,
      currentQty: Number(it.systemQty),
      newQty: Number(it.actualQty),
      unitCost: Number(it.unitCost),
      reason: it.notes ?? "",
      serialNumbers: Array.isArray(it.serialNumbers) ? it.serialNumbers.map(String) : [],
    })),
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
          trackSerial: true,
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
          { label: "Inventaris", href: "/inventaris" },
          { label: "Penyesuaian", href: "/inventaris/penyesuaian" },
          { label: "Ubah" },
        ]}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Ubah</h1>
      </div>
      <StockAdjustmentForm
        adjustment={adjustment as any}
        warehouses={warehouses as any}
        items={items as any}
      />
    </div>
  );
}
