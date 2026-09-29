import { prisma } from "@/lib/db/prisma"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import Link from "next/link"
import {
  Landmark,
  Receipt,
  CreditCard,
  BookOpenCheck,
  CircleDollarSign,
  Coins,
  PiggyBank,
  Target,
  FileSpreadsheet,
  BarChart3,
  ArrowUpRight,
  DollarSign,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
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
import { Badge } from "@/components/ui/shadcn/badge"
import { StatCard } from "@/components/ui/empty-state"
import { StatusChip } from "@/components/ui/status-chip"

async function getFinanceData() {
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const now = new Date()

  const [revenueAgg, receivablesAgg, recentPayments, recentInvoices, pendingApprovals, expenseAgg] =
    await Promise.all([
      prisma.salesInvoice.aggregate({
        _sum: { paidAmount: true, grandTotal: true },
        where: {
          status: { in: ["posted", "partial", "paid"] },
          deletedAt: null,
        },
      }),
      prisma.$queryRaw<{ total: number }[]>`
        SELECT COALESCE(SUM(grand_total - paid_amount), 0) as total
        FROM sales_invoices
        WHERE status IN ('posted', 'partial') AND deleted_at IS NULL
      `,
      prisma.salesPayment.findMany({
        take: 6,
        orderBy: { createdAt: "desc" },
        include: {
          salesInvoice: { include: { customer: { select: { name: true } } } },
        },
      }),
      prisma.salesInvoice.findMany({
        take: 6,
        orderBy: { createdAt: "desc" },
        where: { deletedAt: null },
        include: { customer: { select: { name: true } } },
      }),
      prisma.salesInvoice.count({
        where: { status: "draft", deletedAt: null },
      }),
      prisma.expense.aggregate({
        _sum: { amount: true },
        where: {
          status: "posted",
          date: { gte: startOfMonth },
        },
      }),
    ])

  const totalRevenue = Number(revenueAgg._sum.paidAmount || 0)
  const totalInvoiced = Number(revenueAgg._sum.grandTotal || 0)
  const receivables = Number(receivablesAgg[0]?.total || 0)
  const monthlyExpense = Number(expenseAgg._sum.amount || 0)

  return {
    totalRevenue,
    totalInvoiced,
    receivables,
    monthlyExpense,
    recentPayments,
    recentInvoices,
    pendingApprovals,
  }
}

export default async function FinanceDashboard() {
  const data = await getFinanceData()
  const today = new Date().toLocaleDateString("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })

  const quickLinks = [
    { label: "Jurnal", href: "/keuangan/jurnal", icon: BookOpenCheck, desc: "Jurnal umum" },
    { label: "Faktur", href: "/penjualan/faktur", icon: Receipt, desc: "Faktur penjualan" },
    { label: "Pembayaran", href: "/penjualan/pembayaran", icon: CreditCard, desc: "Pembayaran masuk" },
    { label: "Biaya", href: "/keuangan/pengeluaran", icon: CircleDollarSign, desc: "Catat biaya" },
    { label: "Kas Kecil", href: "/keuangan/kas-kecil", icon: Coins, desc: "Kas kecil" },
    { label: "Anggaran", href: "/keuangan/anggaran", icon: PiggyBank, desc: "Penganggaran" },
  ]

  return (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
          <div className="px-4 text-xs text-muted-foreground lg:px-6">{today}</div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-4 px-4 lg:grid-cols-4 lg:px-6">
            <StatCard
              label="Pendapatan Dibayar"
              value={formatCurrency(data.totalRevenue)}
              icon={<TrendingUp className="size-5" />}
              trend="up"
            />
            <StatCard
              label="Piutang"
              value={formatCurrency(data.receivables)}
              icon={<AlertTriangle className="size-5" />}
              trend={data.receivables > 0 ? "down" : "neutral"}
            />
            <StatCard
              label="Biaya Bulan Ini"
              value={formatCurrency(data.monthlyExpense)}
              icon={<TrendingDown className="size-5" />}
              trend={data.monthlyExpense > 0 ? "down" : "neutral"}
            />
            <StatCard
              label="Faktur Menunggu"
              value={data.pendingApprovals}
              icon={<Receipt className="size-5" />}
            />
          </div>

          {/* Recent payments + Invoices */}
          <div className="grid grid-cols-1 gap-4 px-4 lg:grid-cols-2 lg:px-6">
            {/* Recent payments */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <CreditCard className="size-4 text-primary" />
                  Pembayaran Terbaru
                </CardTitle>
                <CardDescription>6 pembayaran terakhir diterima</CardDescription>
                <CardAction>
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/penjualan/pembayaran">
                      Semua <ArrowUpRight className="size-3.5" />
                    </Link>
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y border-t">
                  {data.recentPayments.length === 0 ? (
                    <p className="px-5 py-10 text-center text-sm text-muted-foreground">
                      Belum ada pembayaran
                    </p>
                  ) : (
                    data.recentPayments.map((payment) => (
                      <div key={payment.id} className="flex items-center justify-between gap-3 px-5 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-mono">{payment.documentNo}</p>
                          <p className="text-xs text-muted-foreground">
                            {payment.salesInvoice?.customer?.name || "-"}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs tabular-nums font-medium">
                            {formatCurrency(Number(payment.amount))}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {formatDate(payment.paymentDate, { format: "short" })}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Recent invoices */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Receipt className="size-4 text-primary" />
                  Faktur Terbaru
                </CardTitle>
                <CardDescription>6 faktur terakhir</CardDescription>
                <CardAction>
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/penjualan/faktur">
                      Semua <ArrowUpRight className="size-3.5" />
                    </Link>
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y border-t">
                  {data.recentInvoices.length === 0 ? (
                    <p className="px-5 py-10 text-center text-sm text-muted-foreground">
                      Belum ada faktur
                    </p>
                  ) : (
                    data.recentInvoices.map((inv) => (
                      <div key={inv.id} className="flex items-center justify-between gap-3 px-5 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-mono">{inv.documentNo}</p>
                          <p className="text-xs text-muted-foreground">{inv.customer.name}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs tabular-nums font-medium">
                            {formatCurrency(Number(inv.grandTotal))}
                          </p>
                          <StatusChip status={inv.status} />
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
                  <link.icon className="size-5 text-primary" />
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
