export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs";
import Link from "next/link";

import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth/permissions";
import { resolveEntity } from "@/lib/utils/resolve-entity";
import { entityEditHref } from "@/lib/utils/entity-url";
export const metadata: Metadata = { title: "Barcode" };

export default async function DetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requirePermission("view_barcodes");

  const { slug } = await params;

  const data = await resolveEntity(
    { segment: slug },
    {
      bySlug: (s) => prisma.barcode.findFirst({ where: { slug: s }, include: { item: true } }),
      byId: (id) => prisma.barcode.findUnique({ where: { id }, include: { item: true } }),
    },
  );

  if (!data) notFound();

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Data Master", href: "/master" },
          { label: "Barcode", href: "/master/barcode" },
          { label: "Detail" },
        ]}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Detail Barcode</h1>
        <Link
          href={entityEditHref("/master/barcode", data)}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all"
        >
          Ubah
        </Link>
      </div>
      <div className="bg-surface rounded-xl border border-default shadow-sm p-4 sm:p-6">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Kode
            </span>
            <span className="text-[0.9375rem] text-foreground font-medium">
              {String(data.barcode ?? "-")}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Tipe
            </span>
            <span className="text-[0.9375rem] text-foreground font-medium">
              {String(data.type ?? "-")}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
