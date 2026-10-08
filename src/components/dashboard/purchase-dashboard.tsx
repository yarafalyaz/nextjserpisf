import { prisma } from "@/lib/db/prisma"
import { formatCurrency, formatDate } from "@/lib/utils/format"
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
} from "lucide-react"
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
  const [pendingPR, pendingPO, recentPOs, recentVendorBills, vendorCount] =
    await Promise.all([
      prisma.purchaseRequest.count({ where: { status: "pending" } }),
      prisma.purchaseOrder.count({
        where: { status: { in: ["draft", "ordered", "partial"] }, deletedAt: null },
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

  const totalPendingValue = recentPOs
    .filter((po) => po.status !== "completed")
    .reduce((sum, po) => sum + Number(po.grandTotal), 0)

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
    { label: "Tagihan Vendor", href: "/pembelian/tagihan", icon: FileSpreadsheet, desc: "Tagihan dari vendor" },
    { label: "Pembayaran", href: "/pembelian/pembayaran-vendor", icon: Banknote, desc: "Pembayaran ke vendor" },
    { label: "Retur", href: "/pembelian/retur", icon: Undo2, desc: "Retur pembelian barang" },
  ]

  return (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
          <div className="px-4 text-xs text-muted-foreground lg:px-6">{today}</div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-4 px-4 lg:grid-cols-4 lg:px-6">
            <StatCard label="PR Menunggu" value={data.pendingPR} icon={<ClipboardList className="size-5" />} />
            <StatCard label="PO Aktif" value={data.pendingPO} icon={<FileCheck className="size-5" />} />
            <StatCard
              label="Nilai PO Aktif"
              value={formatCurrency(data.totalPendingValue)}
              icon={<ShoppingBag className="size-5" />}
            />
            <StatCard label="Vendor" value={data.vendorCount} icon={<Factory className="size-5" />} />
          </div>

          {/* Recent POs */}
          <div className="px-4 lg:px-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShoppingBag className="size-4 text-primary" />
                  Pesanan Pembelian Terbaru
                </CardTitle>
                <CardDescription>8 PO terakhir</CardDescription>
                <CardAction>
                  <Button asChild variant="ghost" size="sm">
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
                      <DetailTableTh>Vendor</DetailTableTh>
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
                            <DetailTableTd className="font-mono text-xs">{po.documentNo}</DetailTableTd>
                            <DetailTableTd className="max-w-[180px] truncate">{po.vendor.name}</DetailTableTd>
                            <DetailTableTd align="right" className="tabular-nums">
                              {formatCurrency(Number(po.grandTotal))}
                            </DetailTableTd>
                            <DetailTableTd>
                              <StatusChip status={po.status} />
                            </DetailTableTd>
                            <DetailTableTd className="text-muted-foreground">
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
          </div>

          {/* Vendor Bills */}
          <div className="grid grid-cols-1 gap-4 px-4 lg:grid-cols-2 lg:px-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <FileSpreadsheet className="size-4 text-primary" />
                  Tagihan Vendor Terbaru
                </CardTitle>
                <CardAction>
                  <Button asChild variant="ghost" size="sm">
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
                      Belum ada tagihan vendor
                    </p>
                  ) : (
                    data.recentVendorBills.map((bill) => (
                      <div key={bill.id} className="flex items-center justify-between px-5 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-mono">{bill.documentNo}</p>
                          <p className="text-xs text-muted-foreground">{bill.vendor.name}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs tabular-nums">{formatCurrency(Number(bill.grandTotal))}</p>
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
            <h2 className="mb-3 text-sm font-semibold">Menu Cepat</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {quickLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex flex-col items-center gap-1.5 rounded-lg border p-4 text-center transition-colors hover:bg-accent"
                >
                  <link.icon className="size-5 t
  )
}
ext-primary" />
                  <span className="text-xs font-medium">{link.label}</span>
                  <span className="text-[10px] text-muted-foreground">{link.desc}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
