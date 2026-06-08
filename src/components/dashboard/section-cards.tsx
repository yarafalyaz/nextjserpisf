"use client"

import {
  TrendingUpIcon,
  TrendingDownIcon,
  DollarSign,
  Receipt,
  Users,
  Car,
  CheckCircle2,
} from "lucide-react"
import { Badge } from "@/components/ui/shadcn/badge"
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card"

interface SectionCardsProps {
  totalRevenue: string
  activeProjects: number
  completedThisMonth: number
  overdueProjects: number
  receivables: string
  totalCustomers: number
}

export function SectionCards({
  totalRevenue,
  activeProjects,
  completedThisMonth,
  overdueProjects,
  receivables,
  totalCustomers,
}: SectionCardsProps) {
  return (
    <div className="*:data-[slot=card]:shadow-xs @xl/main:grid-cols-2 @5xl/main:grid-cols-4 grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card lg:px-6">
      <Card className="@container/card">
        <CardHeader className="relative">
          <CardDescription>Total Pendapatan</CardDescription>
          <CardTitle className="@[250px]/card:text-3xl text-2xl font-semibold tabular-nums">
            {totalRevenue}
          </CardTitle>
          <div className="absolute right-4 top-4">
            <Badge variant="outline" className="flex gap-1 rounded-lg border-transparent bg-emerald-100 text-xs text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
              <TrendingUpIcon className="size-3" />
              Masuk
            </Badge>
          </div>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1 text-sm">
          <div className="line-clamp-1 flex items-center gap-2 font-medium">
            Pembayaran terkonfirmasi
            <DollarSign className="size-4 text-emerald-600" />
          </div>
          <div className="text-muted-foreground">Akumulasi semua transaksi</div>
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader className="relative">
          <CardDescription>Mobil Dikerjakan</CardDescription>
          <CardTitle className="@[250px]/card:text-3xl text-2xl font-semibold tabular-nums">
            {activeProjects}
          </CardTitle>
          <div className="absolute right-4 top-4">
            <Badge variant="outline" className="flex gap-1 rounded-lg text-xs">
              <Car className="size-3" />
              Aktif
            </Badge>
          </div>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1 text-sm">
          <div className="line-clamp-1 flex items-center gap-2 font-medium">
            Selesai bulan ini: {completedThisMonth}
            <CheckCircle2 className="size-4 text-blue-500" />
          </div>
          <div className="text-muted-foreground">Proyek aktif berjalan saat ini</div>
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader className="relative">
          <CardDescription>Piutang Berjalan</CardDescription>
          <CardTitle className="@[250px]/card:text-3xl text-2xl font-semibold tabular-nums">
            {receivables}
          </CardTitle>
          <div className="absolute right-4 top-4">
            <Badge variant="outline" className="flex gap-1 rounded-lg border-transparent bg-amber-100 text-xs text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
              <Receipt className="size-3" />
              Terbuka
            </Badge>
          </div>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1 text-sm">
          <div className="line-clamp-1 flex items-center gap-2 font-medium">
            {overdueProjects} proyek melewati target
            {overdueProjects > 0 ? (
              <TrendingDownIcon className="size-4 text-red-500" />
            ) : (
              <TrendingUpIcon className="size-4 text-emerald-500" />
            )}
          </div>
          <div className="text-muted-foreground">Sisa tagihan yang belum dibayar</div>
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader className="relative">
          <CardDescription>Pelanggan Aktif</CardDescription>
          <CardTitle className="@[250px]/card:text-3xl text-2xl font-semibold tabular-nums">
            {totalCustomers}
          </CardTitle>
          <div className="absolute right-4 top-4">
            <Badge variant="outline" className="flex gap-1 rounded-lg text-xs">
              <Users className="size-3" />
              Pelanggan
            </Badge>
          </div>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1 text-sm">
          <div className="line-clamp-1 flex items-center gap-2 font-medium">
            Pelanggan terdaftar
            <Users className="size-4 text-sky-500" />
          </div>
          <div className="text-muted-foreground">Total pelanggan aktif di sistem</div>
        </CardFooter>
      </Card>
    </div>
  )
}
