export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import { PageHeader, BackButton } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { DetailCard, DetailField } from "@/components/ui/detail-card";

import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth/permissions";
import { resolveEntity } from "@/lib/utils/resolve-entity";
import { entityEditHref } from "@/lib/utils/entity-url";
export const metadata: Metadata = { title: "Akun" };

export default async function DetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requirePermission("view_accounts");

  const { slug } = await params;

  const data = await resolveEntity(
    { segment: slug },
    {
      bySlug: (s) => prisma.account.findFirst({ where: { slug: s } }),
      byId: (id) => prisma.account.findUnique({ where: { id } }),
    },
  );

  if (!data) notFound();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Detail Akun"
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Master Data", href: "/master" },
          { label: "Akun", href: "/master/akun" },
          { label: "Detail" },
        ]}
        actions={
          <>
            <Button href={entityEditHref("/master/akun", data)} variant="primary">
              Ubah
            </Button>
            <BackButton href="/master/akun" />
          </>
        }
      />

      <DetailCard>
        <DetailField label="Kode" value={String(data.code ?? "-")} mono />
        <DetailField label="Nama" value={String(data.name ?? "-")} />
        <DetailField label="Tipe" value={String(data.type ?? "-")} />
        <DetailField
          label="Status"
          value={data.isActive ? "Aktif" : "Nonaktif"}
        />
      </DetailCard>
    </div>
  );
}
