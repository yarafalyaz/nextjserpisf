export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import { AccountForm } from "@/components/forms/account-form";
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs";

import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth/permissions";
import { resolveEntity } from "@/lib/utils/resolve-entity";
export const metadata: Metadata = { title: "Ubah Akun" };

export default async function EditAccountPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requirePermission("edit_accounts");

  const { slug } = await params;

  const data = await resolveEntity(
    { segment: slug },
    {
      bySlug: (s) => prisma.account.findFirst({ where: { slug: s } }),
      byId: (id) => prisma.account.findUnique({ where: { id } }),
    },
  );

  if (!data) notFound();

  const parentAccounts = await prisma.account.findMany({
    where: { parentId: null },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  });

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Data Master", href: "/master" },
          { label: "Akun (COA)", href: "/master/akun" },
          { label: "Ubah" },
        ]}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Ubah Akun</h1>
      </div>
      <AccountForm
        account={{
          id: data.id,
          code: data.code,
          name: data.name,
          type: data.type,
          parentId: data.parentId,
          description: data.description,
          normalBalance: data.normalBalance,
        }}
        accounts={parentAccounts}
      />
    </div>
  );
}
