export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { formatDate } from "@/lib/utils/format";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/ui/empty-state";
import { DeleteButton } from "@/components/ui/delete-button";
import { deleteAssetBrand } from "@/actions/asset.actions";
import { PageHeader, BackButton } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { DetailCard, DetailField } from "@/components/ui/detail-card";
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
} from "@/components/ui/detail-table";
import { Pencil } from "lucide-react";

import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth/permissions";
import { CanCreate } from "@/components/auth/can-create";
import { resolveEntity } from "@/lib/utils/resolve-entity";
import { entityEditHref } from "@/lib/utils/entity-url";
export const metadata: Metadata = { title: "Merek Kendaraan" };

export default async function AssetBrandDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requirePermission("view_asset_brands");

  const { slug } = await params;

  const brand = await resolveEntity(
    { segment: slug, fallbackWhere: {} },
    {
      bySlug: (s) => prisma.assetBrand.findFirst({ where: { slug: s }, include: { models: true } }),
      byId: (id) => prisma.assetBrand.findUnique({ where: { id }, include: { models: true } }),
    },
  );

  if (!brand) notFound();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Merek Aset: ${brand.name}`}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Aset", href: "/aset" },
          { label: "Merek", href: "/aset/merek" },
          { label: brand.name },
        ]}
        actions={
          <>
            <CanCreate permission="edit_asset_brands">
              <Button href={entityEditHref("/aset/merek", brand)} variant="primary">
                <Pencil size={14} /> Ubah
              </Button>
            </CanCreate>
            <CanCreate permission="delete_asset_brands">
              <DeleteButton id={brand.id} action={deleteAssetBrand} />
            </CanCreate>
            <BackButton href="/aset/merek" />
          </>
        }
      />

      <DetailCard>
        <DetailField label="Nama" value={brand.name} />
        <DetailField label="Dibuat" value={formatDate(brand.createdAt)} />
      </DetailCard>

      {/* Models */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">
            Model
          </h2>
        </div>
        <div className="p-4 px-5">
          {brand.models.length === 0 ? (
            <EmptyState title="Belum ada model" />
          ) : (
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>Nama Model</DetailTableTh>
                <DetailTableTh>Dibuat</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {brand.models.map((model) => (
                  <DetailTableRow key={model.id}>
                    <DetailTableTd>{model.name}</DetailTableTd>
                    <DetailTableTd>{formatDate(model.createdAt)}</DetailTableTd>
                  </DetailTableRow>
                ))}
              </DetailTableBody>
            </DetailTable>
          )}
        </div>
      </div>
    </div>
  );
}
