 
export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import { MaterialIssueForm } from "@/components/forms/material-issue-form";
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs";

import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth/permissions";
import { resolveEntity } from "@/lib/utils/resolve-entity";
import { canViewWarehouseScopedDocument } from "@/lib/auth/document-scope";
export const metadata: Metadata = { title: "Ubah Pengeluaran Material" };

export default async function EditPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requirePermission("edit_material_issues");

  const { slug } = await params;

  const data = await resolveEntity(
    { segment: slug },
    {
      bySlug: (s) =>
        prisma.materialIssue.findFirst({
          where: { slug: s },
          include: { items: { select: { itemId: true, qty: true, scrapQty: true, scrapReasonCode: true, scrapNote: true } } },
        }),
      byId: (id) =>
        prisma.materialIssue.findUnique({
          where: { id },
          include: { items: { select: { itemId: true, qty: true, scrapQty: true, scrapReasonCode: true, scrapNote: true } } },
        }),
    },
  );

  if (!data) notFound();

  // Batas gudang sama dengan lampiran, cetak, dan halaman detail — form ini
  // memuat nilai dokumen, jadi tidak boleh lebih longgar.
  if (!(await canViewWarehouseScopedDocument("material_issue", data.id))) notFound();

  const [warehouses, items, costCenters, workOrders, projects] = await Promise.all([
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
    prisma.costCenter.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
    // Sama seperti halaman tambah: tanpa daftar ini kolom penaut perintah kerja
    // dan proyek tampil kosong, dan menyimpan ulang akan menghapus tautan lama.
    prisma.workOrder.findMany({
      where: { status: { in: ["confirmed", "released", "in_progress"] } },
      orderBy: { createdAt: "desc" },
      select: { id: true, documentNo: true },
    }),
    prisma.project.findMany({
      where: { status: "active" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Pengeluaran Material", href: "/inventaris/pengeluaran-material" },
          { label: "Ubah" },
        ]}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Ubah</h1>
      </div>
      <MaterialIssueForm
        // `date` Prisma berupa Date sedangkan form bertipe string dan mengirimnya
        // saat submit — tanpa normalisasi ini pengeluaran material back-date
        // berpindah ke tanggal hari ini saat disimpan ulang.
        issue={{ ...data, date: data.date.toISOString().split("T")[0] } as any}
        warehouses={warehouses as any}
        costCenters={JSON.parse(JSON.stringify(costCenters))}
        items={items as any}
        workOrders={workOrders}
        projects={projects}
      />
    </div>
  );
}
