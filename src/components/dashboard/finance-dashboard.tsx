import { prisma } from "@/lib/db/prisma"
import { formatCurrencyExact, formatDate } from "@/lib/utils/format"
import Link from "next/link"
import {
  Receipt,
  CreditCard,
  BookOpenCheck,
  CircleDollarSign,
  Coins,
  ArrowUpRight,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
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
import { loadOpenReceivablesTotal } from "@/lib/reports/return-credit"
import { isReversedPayment } from "@/lib/finance/payment-status"
import { StatusChip } from "@/components/ui/status-chip"

async function getFinanceData() {
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const [revenueAgg, receivablesAgg, recentPayments, recentInvoices, pendingApprovals, expenseAgg] =
    await Promise.all([
      prisma.salesInvoice.aggregate({
        _sum: { paidAmount: true, grandTotal: true },
        where: {
          status: { in: ["posted", "partial", "paid"] },
          deletedAt: null,
        },
      }),
      loadOpenReceivablesTotal(),
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
          status: "paid",
          date: { gte: startOfMonth },
        },
      }),
    ])

  const totalRevenue = Number(revenueAgg._sum.paidAmount || 0)
  const totalInvoiced = Number(revenueAgg._sum.grandTotal || 0)
  const receivables = Number(receivablesAgg || 0)
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
  ]

  return (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-5 md:py-5">
          <div className="flex flex-col justify-between gap-2 px-4 sm:flex-row sm:items-center lg:px-6">
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                Dasbor Keuangan
              </h1>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {today} · Pemantauan arus kas, piutang usaha, dan pengeluaran operasional
              </p>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 px-4 lg:grid-cols-4 lg:px-6">
            <StatCard
              label="Pendapatan Dibayar"
              value={formatCurrencyExact(data.totalRevenue)}
              icon={<TrendingUp className="size-4" />}
              trend="up"
            />
            <StatCard
              label="Piutang"
              value={formatCurrencyExact(data.receivables)}
              icon={<AlertTriangle className="size-4" />}
              trend={data.receivables > 0 ? "down" : "neutral"}
            />
            <StatCard
              label="Biaya Bulan Ini"
              value={formatCurrencyExact(data.monthlyExpense)}
              icon={<TrendingDown className="size-4" />}
              trend={data.monthlyExpense > 0 ? "down" : "neutral"}
            />
            <StatCard
              label="Faktur Menunggu"
              value={data.pendingApprovals}
              icon={<Receipt className="size-4" />}
            />
          </div>

          {/* Recent payments + Invoices */}
          <div className="grid grid-cols-1 gap-4 px-4 lg:grid-cols-2 lg:px-6">
            {/* Recent payments */}
            <Card className="gap-0 py-0">
              <CardHeader className="py-4">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <CreditCard className="size-4 text-muted-foreground" />
                  Pembayaran Terbaru
                </CardTitle>
                <CardDescription>6 pembayaran terakhir diterima</CardDescription>
                <CardAction>
                  <Button asChild variant="ghost" size="sm" className="h-8 text-xs">
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
                          <div className="flex items-center gap-2">
                            <p className="truncate font-mono text-xs font-medium text-foreground">
                              {payment.documentNo}
                            </p>
                            {/* Putaran 97: baris reversed tetap tampil (histori),
                                wajib berlabel — payment-status.ts. */}
                            {isReversedPayment(payment) && (
                              <StatusChip status={payment.status} />
                            )}
                          </div>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {payment.salesInvoice?.customer?.name || "-"}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono text-xs font-medium tabular-nums text-foreground">
                            {formatCurrencyExact(Number(payment.amount))}
                          </p>
                          <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
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
            <Card className="gap-0 py-0">
              <CardHeader className="py-4">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Receipt className="size-4 text-muted-foreground" />
                  Faktur Terbaru
                </CardTitle>
                <CardDescription>6 faktur terakhir</CardDescription>
                <CardAction>
                  <Button asChild variant="ghost" size="sm" className="h-8 text-xs">
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
                          <p className="truncate font-mono text-xs font-medium text-foreground">{inv.documentNo}</p>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">{inv.customer.name}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1 text-right">
                          <p className="font-mono text-xs font-medium tabular-nums text-foreground">
                            {formatCurrencyExact(Number(inv.grandTotal))}
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
            <h2 className="mb-2.5 text-xs font-semibold tracking-wider uppercase text-muted-foreground">
              Menu Cepat
            </h2>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
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
                  <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground/50 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
