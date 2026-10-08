import {
  Users,
  Factory,
  Package,
  Tag,
  Layers,
  Building2,
  UserCircle,
  Briefcase,
  BookOpen,
  Landmark,
  BadgeDollarSign,
  ListOrdered,
  ScanBarcode,
  CalendarDays,
  Scale,
  CreditCard,
  Truck,
} from "lucide-react";
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs";
import { ModuleGrid, type ModuleItem } from "@/components/ui/module-grid";
import { requireAnyPermission } from "@/lib/auth/permissions";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Master Data" };

const masterModules: ModuleItem[] = [
  {
    label: "Pelanggan",
    href: "/master/pelanggan",
    icon: Users,
    desc: "Kelola data pelanggan",
    permission: "view_customers",
  },
  {
    label: "Kategori Pelanggan",
    href: "/master/kategori-pelanggan",
    icon: Tag,
    desc: "Kelola kategori pelanggan & presentasi DP",
    permission: "view_customers",
  },
  {
    label: "Vendor",
    href: "/master/vendor",
    icon: Factory,
    desc: "Kelola data vendor/supplier",
    permission: "view_vendors",
  },
  {
    label: "Item",
    href: "/master/barang",
    icon: Package,
    desc: "Kelola data barang",
    permission: "view_items",
  },
  {
    label: "Kategori Barang",
    href: "/master/kategori-barang",
    icon: Tag,
    desc: "Kategori barang",
    permission: "view_item_categories",
  },
  {
    label: "Merek",
    href: "/master/merek",
    icon: Layers,
    desc: "Kelola brand/merek",
    permission: "view_brands",
  },
  {
    label: "Gudang",
    href: "/master/gudang",
    icon: Building2,
    desc: "Kelola gudang",
    permission: "view_warehouses",
  },
  {
    label: "Karyawan",
    href: "/master/karyawan",
    icon: UserCircle,
    desc: "Kelola data karyawan",
    permission: "view_employees",
  },
  {
    label: "Departemen",
    href: "/master/departemen",
    icon: Briefcase,
    desc: "Kelola departemen",
    permission: "view_departments",
  },
  {
    label: "Jabatan",
    href: "/master/jabatan",
    icon: Briefcase,
    desc: "Kelola jabatan",
    permission: "view_positions",
  },
  {
    label: "Akun (COA)",
    href: "/master/akun",
    icon: BookOpen,
    desc: "Chart of Accounts",
    permission: "view_accounts",
  },
  {
    label: "Bank",
    href: "/master/bank",
    icon: Landmark,
    desc: "Kelola data bank",
    permission: "view_banks",
  },
  {
    label: "Pajak",
    href: "/master/pajak",
    icon: BadgeDollarSign,
    desc: "Kelola pajak",
    permission: "view_taxes",
  },
  {
    label: "Kelompok Pajak",
    href: "/master/kelompok-pajak",
    icon: ListOrdered,
    desc: "Grup pajak",
    permission: "view_tax_groups",
  },
  {
    label: "Kategori Pengeluaran",
    href: "/master/kategori-pengeluaran",
    icon: Tag,
    desc: "Kategori pengeluaran operasional",
    permission: "manage_expense_categories",
  },
  {
    label: "Barcode",
    href: "/master/barcode",
    icon: ScanBarcode,
    desc: "Kelola barcode",
    permission: "view_barcodes",
  },
  {
    label: "Payment Terms",
    href: "/master/syarat-pembayaran",
    icon: CalendarDays,
    desc: "Termin pembayaran",
    permission: "view_payment_terms",
  },
  {
    label: "Metode Pembayaran",
    href: "/master/metode-pembayaran",
    icon: CreditCard,
    desc: "Metode pembayaran",
    permission: "view_payment_methods",
  },
  {
    label: "Metode Pengiriman",
    href: "/master/metode-pengiriman",
    icon: Truck,
    desc: "Metode pengiriman",
    permission: "view_shipping_methods",
  },
  {
    label: "Satuan",
    href: "/master/satuan",
    icon: Scale,
    desc: "Satuan ukuran",
    permission: "view_units",
  },
];

const MASTER_PERMISSIONS = [
  "view_customers",
  "view_vendors",
  "view_items",
  "view_item_categories",
  "view_brands",
  "view_warehouses",
  "view_employees",
  "view_departments",
  "view_positions",
  "view_accounts",
  "view_banks",
  "view_taxes",
  "view_tax_groups",
  "manage_expense_categories",
  "view_barcodes",
  "view_payment_terms",
  "view_payment_methods",
  "view_shipping_methods",
  "view_units",
];

export default async function MasterPage() {
  const user = await requireAnyPermission(MASTER_PERMISSIONS);
  const isSuperAdmin = user.roles.includes("super_admin");

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[{ label: "Dasbor", href: "/" }, { label: "Master Data" }]}
      />
      <h1 id="master-heading" className="text-2xl font-bold text-foreground">
        Data Master
      </h1>
      <ModuleGrid
        ariaLabel="Modul Data Master"
        headingId="master-heading"
        items={masterModules}
        userPermissions={user.permissions}
        isSuperAdmin={isSuperAdmin}
      />
    </div>
  );
}
