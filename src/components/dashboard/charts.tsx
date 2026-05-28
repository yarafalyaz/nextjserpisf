"use client"

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts"

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"]

type RevenueData = { month: string; revenue: number }
type StatusData = { name: string; value: number }
type CustomerData = { name: string; revenue: number }

export function RevenueChart({ data }: { data: RevenueData[] }) {
  return (
    <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
      <div className="p-4 px-5 border-b border-default">
        <h2 className="text-[0.9375rem] font-semibold text-foreground">Revenue Trend (6 Bulan Terakhir)</h2>
      </div>
      <div className="p-4 px-5">
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%" minWidth={300} minHeight={200}>
            <LineChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-default, #e5e7eb)" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="var(--color-muted, #9ca3af)" />
              <YAxis tick={{ fontSize: 12 }} stroke="var(--color-muted, #9ca3af)" tickFormatter={(v) => `${(v / 1000000).toFixed(0)}jt`} />
              <Tooltip
                formatter={(value) => [`Rp ${Number(value).toLocaleString("id-ID")}`, "Revenue"]}
                contentStyle={{ borderRadius: "8px", border: "1px solid var(--color-default, #e5e7eb)", fontSize: "13px" }}
              />
              <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

export function SalesStatusChart({ data }: { data: StatusData[] }) {
  const total = data.reduce((sum, d) => sum + d.value, 0)

  return (
    <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
      <div className="p-4 px-5 border-b border-default">
        <h2 className="text-[0.9375rem] font-semibold text-foreground">Sales by Status</h2>
      </div>
      <div className="p-4 px-5">
        <div className="h-[280px] flex items-center">
          <ResponsiveContainer width="100%" height="100%" minWidth={300} minHeight={200}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={2}
                dataKey="value"
              >
                {data.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value, name) => [`${Number(value)} invoice (${total > 0 ? ((Number(value) / total) * 100).toFixed(0) : 0}%)`, name]}
                contentStyle={{ borderRadius: "8px", border: "1px solid var(--color-default, #e5e7eb)", fontSize: "13px" }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-wrap gap-3 mt-2 justify-center">
          {data.map((item, index) => (
            <div key={item.name} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
              <span className="text-xs text-muted capitalize">{item.name} ({item.value})</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function TopCustomersChart({ data }: { data: CustomerData[] }) {
  return (
    <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
      <div className="p-4 px-5 border-b border-default">
        <h2 className="text-[0.9375rem] font-semibold text-foreground">Top 5 Customers by Revenue</h2>
      </div>
      <div className="p-4 px-5">
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%" minWidth={300} minHeight={200}>
            <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-default, #e5e7eb)" />
              <XAxis type="number" tick={{ fontSize: 12 }} stroke="var(--color-muted, #9ca3af)" tickFormatter={(v) => `${(v / 1000000).toFixed(0)}jt`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} stroke="var(--color-muted, #9ca3af)" width={100} />
              <Tooltip
                formatter={(value) => [`Rp ${Number(value).toLocaleString("id-ID")}`, "Revenue"]}
                contentStyle={{ borderRadius: "8px", border: "1px solid var(--color-default, #e5e7eb)", fontSize: "13px" }}
              />
              <Bar dataKey="revenue" fill="#10b981" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
