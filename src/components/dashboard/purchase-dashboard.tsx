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
import { StatusChip } from "@/components/ui/status-chip"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/shadcn/table"

async function getPurchasingData() {
  const [pendingPR, pendingPO, poActiveAgg, recentPOs, recentVendorBills, vendorCount] =
    await Promise.all([
      prisma.purchaseRequest.count({ where: { status: { in: ["draft", "approved"] } } }),
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
          <section aria-label="Ringkasan pembelian" className="px-4 lg:px-6">
            <dl className="grid grid-cols-1 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card shadow-2xs sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
              <div className="flex min-w-0 flex-col justify-between gap-2 p-4 lg:p-5">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-xs font-medium text-muted-foreground">PR Menunggu</dt>
                  <ClipboardList className="size-4 text-muted-foreground/60" aria-hidden="true" />
                </div>
                <dd className="text-2xl leading-[1.15] font-semibold tracking-[-0.02em] text-foreground tabular-nums">
                  {data.pendingPR}
                </dd>
              </div>
              <div className="flex min-w-0 flex-col justify-between gap-2 p-4 sm:border-t-0 lg:p-5">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-xs font-medium text-muted-foreground">PO Aktif</dt>
                  <FileCheck className="size-4 text-muted-foreground/60" aria-hidden="true" />
                </div>
                <dd className="text-2xl leading-[1.15] font-semibold tracking-[-0.02em] text-foreground tabular-nums">
                  {data.pendingPO}
                </dd>
              </div>
              <div className="flex min-w-0 flex-col justify-between gap-2 p-4 sm:border-t lg:border-t-0 lg:p-5">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-xs font-medium text-muted-foreground">Nilai PO Aktif</dt>
                  <ShoppingBag className="size-4 text-muted-foreground/60" aria-hidden="true" />
                </div>
                <dd className="text-2xl leading-[1.15] font-semibold tracking-[-0.02em] text-foreground tabular-nums">
                  {formatCurrencyExact(data.totalPendingValue)}
                </dd>
              </div>
              <div className="flex min-w-0 flex-col justify-between gap-2 p-4 sm:border-t lg:border-t-0 lg:p-5">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-xs font-medium text-muted-foreground">Pemasok</dt>
                  <Factory className="size-4 text-muted-foreground/60" aria-hidden="true" />
                </div>
                <dd className="text-2xl leading-[1.15] font-semibold tracking-[-0.02em] text-foreground tabular-nums">
                  {data.vendorCount}
                </dd>
              </div>
            </dl>
          </section>

          {/* Recent POs + Vendor Bills */}
          <div className="grid grid-cols-1 gap-4 px-4 xl:grid-cols-3 lg:px-6">
            <Card className="gap-0 py-0 xl:col-span-2">
              <CardHeader className="py-4">
                <CardTitle className="flex items-center gap-2">
                  <ShoppingBag aria-hidden="true" className="size-4 text-muted-foreground" />
                  Pesanan Pembelian Terbaru
                </CardTitle>
                <CardDescription>8 PO terakhir</CardDescription>
                <CardAction>
                  <Button asChild variant="ghost" size="sm" className="h-8 text-xs">
                    <Link href="/pembelian/pesanan">
                      Semua <ArrowUpRight aria-hidden="true" className="size-3.5" />
                    </Link>
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y border-t md:hidden">
                  {data.recentPOs.length === 0 ? (
                    <p className="px-5 py-10 text-center text-sm text-muted-foreground">
                      Belum ada pesanan pembelian
                    </p>
                  ) : (
                    data.recentPOs.map((po) => (
                      <div key={po.id} className="flex items-start justify-between gap-3 px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-mono text-xs font-medium text-foreground">{po.documentNo}</p>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">{po.vendor.name}</p>
                          <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
                            {formatDate(po.date, { format: "short" })}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                          <p className="font-mono text-xs font-medium tabular-nums text-foreground">
                            {formatCurrencyExact(Number(po.grandTotal))}
                          </p>
                          <StatusChip status={po.status} />
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="hidden border-t md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>No. Dokumen</TableHead>
                        <TableHead>Pemasok</TableHead>
                        <TableHead className="text-right">Nilai</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Tgl</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.recentPOs.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                            Belum ada pesanan pembelian
                          </TableCell>
                        </TableRow>
                      ) : (
                        data.recentPOs.map((po) => (
                          <TableRow key={po.id}>
                            <TableCell className="font-mono text-xs font-medium">{po.documentNo}</TableCell>
                            <TableCell className="max-w-[180px] truncate font-medium">{po.vendor.name}</TableCell>
                            <TableCell className="text-right font-mono text-xs font-medium tabular-nums">
                              {formatCurrencyExact(Number(po.grandTotal))}
                            </TableCell>
                            <TableCell>
                              <StatusChip status={po.status} />
                            </TableCell>
                            <TableCell className="text-xs tabular-nums text-muted-foreground">
                              {formatDate(po.date, { format: "short" })}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Vendor Bills */}
            <Card className="gap-0 py-0">
              <CardHeader className="py-4">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <FileSpreadsheet aria-hidden="true" className="size-4 text-muted-foreground" />
                  Tagihan Pemasok Terbaru
                </CardTitle>
                <CardDescription>Tagihan terbuka & konsep</CardDescription>
                <CardAction>
                  <Button asChild variant="ghost" size="sm" className="h-8 text-xs">
                    <Link href="/pembelian/tagihan">
                      Semua <ArrowUpRight aria-hidden="true" className="size-3.5" />
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
            <div className="grid grid-cols-2 gap-2 sm:gap-2.5 lg:grid-cols-3">
              {quickLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="group flex items-center justify-between gap-2 rounded-lg border bg-card p-2.5 shadow-2xs transition-all duration-150 active:scale-[0.98] sm:gap-3 sm:p-3.5 [@media(hover:hover)]:hover:border-foreground/20 [@media(hover:hover)]:hover:bg-muted/40"
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
                  <ArrowUpRight aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground/50 transition-colors duration-150 group-hover:translate-x-0.5 group- group-hover:text-foreground" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
