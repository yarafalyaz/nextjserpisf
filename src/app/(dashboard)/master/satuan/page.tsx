export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { entityHref } from "@/lib/utils/entity-url";
import { parsePagination } from "@/lib/utils/pagination";
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs";
import { EmptyState } from "@/components/ui/empty-state";
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
} from "@/components/ui/detail-table";
import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/permissions";
import { CanCreate } from "@/components/auth/can-create";

export const metadata: Metadata = { title: "Satuan" };

export default async function UomPage({
  searchParams,
}: {
  searchParams: Promise<{ halaman?: string; pageSize?: string }>;
}) {
  await requirePermission("view_units");

  const params = await searchParams;
  const { page, pageSize, take } = parsePagination(params);

  const [units, total] = await Promise.all([
    prisma.unitOfMeasure.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      take,
      skip: (page - 1) * pageSize,
    }),
    prisma.unitOfMeasure.count({ where: { isActive: true } }),
  ]);

  const totalPages = Math.ceil(total / pageSize);

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
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">Satuan</h1>
        <CanCreate permission="edit_units">
          <Link
            href="/master/satuan/tambah"
            className="inline-flex items-center justify-center gap-1.5 w-full sm:w-auto px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all"
          >
            + Tambah Satuan
          </Link>
        </CanCreate>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
          <DetailTable>
            <DetailTableHead>
              <DetailTableTh>Nama</DetailTableTh>
              <DetailTableTh>Simbol</DetailTableTh>
              <DetailTableTh>Kategori</DetailTableTh>
              <DetailTableTh>Aksi</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {units.length === 0 ? (
                <DetailTableRow>
                  <DetailTableTd colSpan={4} className="py-10 px-4">
                    <EmptyState title="Belum ada satuan" className="py-0" />
                  </DetailTableTd>
                </DetailTableRow>
              ) : (
                units.map((u) => (
                  <DetailTableRow key={u.id}>
                    <DetailTableTd>{u.name}</DetailTableTd>
                    <DetailTableTd className="font-mono">
                      {u.symbol}
                    </DetailTableTd>
                    <DetailTableTd>{u.category ?? "-"}</DetailTableTd>
                    <DetailTableTd>
                      <Link
                        href={entityHref("/master/satuan", u)}
                        className="button button--ghost button--sm"
                      >
                        Detail
                      </Link>
                    </DetailTableTd>
                  </DetailTableRow>
                ))
              )}
            </DetailTableBody>
          </DetailTable>

        {totalPages > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 px-5 border-t border-default">
            <span className="text-[0.8125rem] text-muted-foreground">
              Hal {page} dari {totalPages} ({total} data)
            </span>
            <div className="flex gap-1">
              {page > 1 && (
                <Link
                  href={`/master/satuan?halaman=${page - 1}`}
                  className="button button--ghost button--sm"
                >
                  ← Sebelumnya
                </Link>
              )}
              {page < totalPages && (
                <Link
                  href={`/master/satuan?halaman=${page + 1}`}
                  className="button button--ghost button--sm"
                >
                  Berikutnya →
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
