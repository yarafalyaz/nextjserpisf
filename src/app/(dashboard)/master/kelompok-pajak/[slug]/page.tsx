export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs";
import Link from "next/link";

import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth/permissions";
import { CanCreate } from "@/components/auth/can-create";
import { resolveEntity } from "@/lib/utils/resolve-entity";
import { entityEditHref } from "@/lib/utils/entity-url";
export const metadata: Metadata = { title: "Kelompok Pajak" };

export default async function DetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requirePermission("view_tax_groups");

  const { slug } = await params;

  const data = await resolveEntity(
    { segment: slug },
    {
      bySlug: (s) =>
        prisma.taxGroup.findFirst({
          where: { slug: s },
          include: { taxes: { include: { tax: true } } },
        }),
      byId: (id) =>
        prisma.taxGroup.findUnique({
          where: { id },
          include: { taxes: { include: { tax: true } } },
        }),
    },
  );

  if (!data) notFound();

  const memberTaxes = data.taxes
    .map((item) => item.tax)
    .filter((tax) => tax && tax.deletedAt === null);

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Data Master", href: "/master" },
          { label: "Grup Pajak", href: "/master/kelompok-pajak" },
          { label: "Detail" },
        ]}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">
          Detail Kelompok Pajak
        </h1>
        <CanCreate permission="edit_taxes">
          <Link
            href={entityEditHref("/master/kelompok-pajak", data)}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-offset-2"
          >
            Ubah
          </Link>
        </CanCreate>
      </div>
      <div className="bg-surface rounded-xl border border-default shadow-sm p-4 sm:p-6">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Nama
            </span>
            <span className="text-[0.9375rem] text-foreground font-medium">
              {String(data.name ?? "-")}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Pajak Termasuk
            </span>
            {memberTaxes.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 mt-0.5">
                {memberTaxes.map((tax) => (
                  <span
                    key={tax.id}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/50 px-2 py-0.5 text-xs font-medium text-foreground"
                  >
                    <span>{tax.name}</span>
                    <span className="font-mono tabular-nums text-muted-foreground">
                      ({Number(tax.rate).toLocaleString("id-ID")}%)
                    </span>
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-[0.9375rem] text-muted-foreground font-medium">
                Belum ada pajak terdaftar
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
