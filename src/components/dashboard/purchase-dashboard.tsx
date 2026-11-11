import { prisma } from "@/lib/db/prisma"
import { OPEN_PURCHASE_ORDER_STATUSES } from "@/lib/reports/bom-revision-impact"
import { formatCurrencyExact, formatDate } from "@/lib/utils/format"
import Link from "next/link"
import {
  ShoppingBag,
  FileCheck,
  FileSpreadsheet,
  Factory,
  ClipboardList,
  Banknote,
  Undo2,
  ArrowUpRight,
  Package,
} from "@/components/ui/fontawesome-icons"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card"
import { Button } from "@/components/ui/shadcn/button"
import { StatCard } from "@/components/ui/empty-state"
import { StatusChip } from "@/components/ui/status-chip"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"

async function getPurchasingData() {
  const [pendingPR, pendingPO, poActiveAgg, recentPOs, recentVendorBills, vendorCount] =
    await Promise.all([
      prisma.purchaseRequest.count({ where: { status: { in: ["draft", "approved"] }, deletedAt: null } }),
      prisma.purchaseOrder.count({
        where: { status: { in: [...OPEN_PURCHASE_ORDER_STATUSES] }, deletedAt: null },
      }),
      prisma.purchaseOrder.aggregate({
        where: { status: { in: [...OPEN_PURCHASE_ORDER_STATUSES] }, deletedAt: null },
        _sum: { grandTotal: true },
      }),
      prisma.purchaseOrder.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 8,
        include: { vendor: { select: { name: true } } },
      }),
      prisma.vendorBill.findMany({
        where: { status: { in: ["draft", "posted"] } },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { vendor: { select: { name: true } } },
      }),
      prisma.vendor.count({ where: { deletedAt: null } }),
    ])

  const totalPendingValue = Number(poActiveAgg._sum.grandTotal ?? 0)

  return { pendingPR, pendingPO, totalPendingValue, recentPOs, recentVendorBills, vendorCount }
}

export default async function PurchaseDashboard() {
  const data = await getPurchasingData()
  const today = new Date().toLocaleDateString("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })

  const quickLinks = [
    { label: "Permintaan", href: "/pembelian/permintaan", icon: ClipboardList, desc: "Permintaan pembelian" },
    { label: "Pesanan", href: "/pembelian/pesanan", icon: FileCheck, desc: "Pesanan pembelian" },
    { label: "Penerimaan", href: "/pembelian/penerimaan", icon: Package, desc: "Penerimaan barang" },
    { label: "Tagihan Pemasok", href: "/pembelian/tagihan", icon: FileSpreadsheet, desc: "Tagihan dari pemasok" },
    { label: "Pembayaran", href: "/pembelian/pembayaran-vendor", icon: Banknote, desc: "Pembayaran ke pemasok" },
    { label: "Retur", href: "/pembelian/retur", icon: Undo2, desc: "Retur pembelian barang" },
  ]

  return (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-5 md:py-5">
          <div className="flex flex-col justify-between gap-2 px-4 sm:flex-row sm:items-center lg:px-6">
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                Dasbor Pembelian & Pengadaan
              </h1>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {today} · Pemantauan permintaan barang, pesanan pemasok, dan tagihan pembelian
              </p>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 px-4 lg:grid-cols-4 lg:px-6">
            <StatCard label="PR Menunggu" value={data.pendingPR} icon={<ClipboardList className="size-4" />} />
            <StatCard label="PO Aktif" value={data.pendingPO} icon={<FileCheck className="size-4" />} />
            <StatCard
              label="Nilai PO Aktif"
              value={formatCurrencyExact(data.totalPendingValue)}
              icon={<ShoppingBag className="size-4" />}
            />
            <StatCard label="Pemasok" value={data.vendorCount} icon={<Factory className="size-4" />} />
          </div>

          {/* Recent POs + Vendor Bills */}
          <div className="grid grid-cols-1 gap-4 px-4 xl:grid-cols-3 lg:px-6">
            <Card className="gap-0 py-0 xl:col-span-2">
              <CardHeader className="py-4">
                <CardTitle className="flex items-center gap-2">
                  <ShoppingBag className="size-4 text-muted-foreground" />
                  Pesanan Pembelian Terbaru
                </CardTitle>
                <CardDescription>8 PO terakhir</CardDescription>
                <CardAction>
                  <Button asChild variant="ghost" size="sm" className="h-8 text-xs">
                    <Link href="/pembelian/pesanan">
                      Semua <ArrowUpRight className="size-3.5" />
                    </Link>
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="p-0">
                <div className="border-t">
                  <DetailTable>
                    <DetailTableHead>
                      <DetailTableTh>No. Dokumen</DetailTableTh>
                      <DetailTableTh>Pemasok</DetailTableTh>
                      <DetailTableTh align="right">Nilai</DetailTableTh>
                      <DetailTableTh>Status</DetailTableTh>
                      <DetailTableTh>Tgl</DetailTableTh>
                    </DetailTableHead>
                    <DetailTableBody>
                      {data.recentPOs.length === 0 ? (
                        <DetailTableRow>
                          <DetailTableTd colSpan={5} align="center" className="py-10 text-muted-foreground">
                            Belum ada pesanan pembelian
                          </DetailTableTd>
                        </DetailTableRow>
                      ) : (
                        data.recentPOs.map((po) => (
                          <DetailTableRow key={po.id}>
                            <DetailTableTd className="font-mono text-xs font-medium">{po.documentNo}</DetailTableTd>
                            <DetailTableTd className="max-w-[180px] truncate font-medium">{po.vendor.name}</DetailTableTd>
                            <DetailTableTd align="right" className="font-mono text-xs font-medium tabular-nums">
                              {formatCurrencyExact(Number(po.grandTotal))}
                            </DetailTableTd>
                            <DetailTableTd>
                              <StatusChip status={po.status} />
                            </DetailTableTd>
                            <DetailTableTd className="text-xs tabular-nums text-muted-foreground">
                              {formatDate(po.date, { format: "short" })}
                            </DetailTableTd>
                          </DetailTableRow>
                        ))
                      )}
                    </DetailTableBody>
                  </DetailTable>
                </div>
              </CardContent>
            </Card>

            {/* Vendor Bills */}
            <Card className="gap-0 py-0">
              <CardHeader className="py-4">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <FileSpreadsheet className="size-4 text-muted-foreground" />
                  Tagihan Pemasok Terbaru
                </CardTitle>
                <CardDescription>Tagihan terbuka & konsep</CardDescription>
                <CardAction>
                  <Button asChild variant="ghost" size="sm" className="h-8 text-xs">
                    <Link href="/pembelian/tagihan">
                      Semua <ArrowUpRight className="size-3.5" />
                    </Link>
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y border-t">
                  {data.recentVendorBills.length === 0 ? (
                    <p className="px-5 py-10 text-center text-sm text-muted-foreground">
                      Belum ada tagihan pemasok
                    </p>
                  ) : (
                    data.recentVendorBills.map((bill) => (
                      <div key={bill.id} className="flex items-center justify-between gap-3 px-5 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-mono text-xs font-medium text-foreground">{bill.documentNo}</p>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">{bill.vendor.name}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1 text-right">
                          <p className="font-mono text-xs font-medium tabular-nums text-foreground">
                            {formatCurrencyExact(Number(bill.grandTotal))}
                          </p>
                          <StatusChip status={bill.status} />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Quick Links */}
          <div className="px-4 lg:px-6">
            <h2 className="mb-2.5 text-xs font-semibold tracking-wider uppercase text-muted-foreground">
              Menu Cepat
            </h2>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {quickLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="group flex items-center justify-between gap-3 rounded-lg border bg-card p-3.5 shadow-2xs transition-colors duration-150 hover:border-foreground/20 hover:bg-muted/40"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-muted/50 text-muted-foreground transition-colors group-hover:text-foreground">
                      <link.icon className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold text-foreground">{link.label}</div>
                      <div className="truncate text-[11px] text-muted-foreground">{link.desc}</div>
                    </div>
                  </div>
                  <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground/50 transition-colors duration-150 group-hover:translate-x-0.5 group- group-hover:text-foreground" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
