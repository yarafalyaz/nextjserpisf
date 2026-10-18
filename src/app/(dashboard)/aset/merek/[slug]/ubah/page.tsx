export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import { AssetBrandForm } from "@/components/forms/asset-brand-form";
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs";

import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth/permissions";
import { resolveEntity } from "@/lib/utils/resolve-entity";
export const metadata: Metadata = { title: "Ubah Merek Kendaraan" };

export default async function EditPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requirePermission("edit_asset_brands");

  const { slug } = await params;

  const data = await resolveEntity(
    { segment: slug, fallbackWhere: {} },
    {
      bySlug: (s) =>
        prisma.assetBrand.findFirst({
          where: { slug: s },
          include: { models: { select: { name: true }, orderBy: { name: "asc" } } },
        }),
      byId: (id) =>
        prisma.assetBrand.findUnique({
          where: { id },
          include: { models: { select: { name: true }, orderBy: { name: "asc" } } },
        }),
    },
  );

  if (!data) notFound();

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Merek", href: "/aset/merek" },
          { label: "Ubah" },
        ]}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Ubah</h1>
      </div>
      <AssetBrandForm brand={{ id: data.id, name: data.name, models: data.models }} />
    </div>
  );
}
