import { Plus, Scale, Layers } from "lucide-react";
export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { parsePagination } from "@/lib/utils/pagination";
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs";
import { requirePermission } from "@/lib/auth/permissions";
import { CanCreate } from "@/components/auth/can-create";
import { UomTable } from "./_components/uom-table";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Satuan" };

export default async function UomPage({
  searchParams,
}: {
  searchParams: Promise<{ halaman?: string; pageSize?: string; cari?: string; q?: string }>;
}) {
  await requirePermission("view_units");

  const params = await searchParams;
  const { page, pageSize, take } = parsePagination(params);
  const searchQuery = (params.cari || params.q || "").trim();

  const whereClause = {
    isActive: true,
    ...(searchQuery
      ? {
          OR: [
            { name: { contains: searchQuery } },
            { symbol: { contains: searchQuery } },
            { category: { contains: searchQuery } },
          ],
        }
      : {}),
  };

  const [units, total, categoriesCount] = await Promise.all([
    prisma.unitOfMeasure.findMany({
      where: whereClause,
      orderBy: { name: "asc" },
      take,
      skip: (page - 1) * pageSize,
    }),
    prisma.unitOfMeasure.count({ where: whereClause }),
    prisma.unitOfMeasure.groupBy({
      by: ["category"],
      where: { isActive: true },
      _count: true,
    }),
  ]);

  const serializedUnits = units.map((u) => ({
    id: u.id,
    name: u.name,
    symbol: u.symbol,
    category: u.category,
    isActive: u.isActive,
  }));

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Data Master", href: "/master" },
          { label: "Satuan" },
        ]}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">
            Satuan Ukuran (UOM)
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Katalog satuan ukuran standar untuk inventaris, transaksi pembelian, dan penjualan.
          </p>
        </div>
        <CanCreate permission="edit_units">
          <Link
            href="/master/satuan/tambah"
            className="inline-flex items-center justify-center gap-1.5 w-full sm:w-auto px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:shadow-md transition-all"
          >
            <Plus className="size-3.5" />
            <span>Tambah Satuan</span>
          </Link>
        </CanCreate>
      </div>

      {/* Executive Metric Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-surface rounded-xl border border-default p-4 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Total Satuan Aktif
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-foreground mt-0.5">
              {total}
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <Scale className="size-5" />
          </div>
        </div>

        <div className="bg-surface rounded-xl border border-default p-4 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Kelompok Kategori
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-foreground mt-0.5">
              {categoriesCount.length}
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400">
            <Layers className="size-5" />
          </div>
        </div>
      </div>

      <UomTable
        data={serializedUnits}
        page={page}
        pageSize={pageSize}
        total={total}
      />
    </div>
  );
}
