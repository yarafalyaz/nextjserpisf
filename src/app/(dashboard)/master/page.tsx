import { AppBreadcrumbs } from "@/components/ui/breadcrumbs";
import { ModuleGrid } from "@/components/ui/module-grid"
import { moduleItemsForGroup, groupPermissions } from "@/components/layout/module-cards"
import { requireAnyPermission } from "@/lib/auth/permissions";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Data Master" };


export default async function MasterPage() {
  const user = await requireAnyPermission(groupPermissions("/master"));
  const isSuperAdmin = user.roles.includes("super_admin");

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[{ label: "Dasbor", href: "/" }, { label: "Data Master", href: "/master" }]}
      />
      <h1 id="master-heading" className="text-2xl font-bold text-foreground">
        Data Master
      </h1>
      <ModuleGrid
        ariaLabel="Modul Data Master"
        headingId="master-heading"
        items={moduleItemsForGroup("/master")}
        userPermissions={user.permissions}
        isSuperAdmin={isSuperAdmin}
      />
    </div>
  );
}
