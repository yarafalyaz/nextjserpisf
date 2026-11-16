"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { CalendarDays, ChevronRight, Filter } from "@/components/ui/fontawesome-icons"
import { WEEKDAY_LABELS } from "@/lib/reports/calendar-grid"
import { formatCurrencyExact } from "@/lib/utils/format"

export type CalendarEventKind =
  | "invoice"
  | "invoice-due"
  | "bill"
  | "bill-due"
  | "delivery"
  | "expected"
  | "recurring"
  | "holiday"

export interface SerializedCalendarEvent {
  id: string
  dayKey: string
  kind: CalendarEventKind
  label: string
  amount: number | null
  amountFormatted?: string
  href: string
}

export interface SerializedCalendarDay {
  key: string
  dayNumber: number
  inMonth: boolean
  isToday: boolean
  fullDateLabel: string
}

const KIND_STYLES: Record<CalendarEventKind, { chip: string; label: string }> = {
  invoice: {
    chip: "bg-primary/12 text-primary border-primary/25",
    label: "Faktur",
  },
  "invoice-due": {
    chip: "bg-warning/12 text-amber-700 border-warning/25 dark:text-amber-400",
    label: "Tempo Piutang",
  },
  bill: {
    chip: "bg-danger/12 text-red-700 border-danger/25 dark:text-red-400",
    label: "Tagihan",
  },
  "bill-due": {
    chip: "bg-danger/12 text-red-700 border-danger/25 dark:text-red-400",
    label: "Tempo Hutang",
  },
  delivery: {
    chip: "bg-success/12 text-emerald-700 border-success/25 dark:text-emerald-400",
    label: "Jadwal Kirim",
  },
  expected: {
    chip: "bg-surface-muted text-muted-foreground border-default",
    label: "Jadwal Terima",
  },
  recurring: {
    chip: "bg-accent/12 text-accent-foreground border-accent/25",
    label: "Berulang",
  },
  holiday: {
    chip: "bg-rose-500/12 text-rose-700 border-rose-500/25 dark:text-rose-400",
    label: "Hari Libur",
  },
}

const WEEKDAY_SHORT = ["S", "S", "R", "K", "J", "S", "M"]

export function CalendarBoard({
  weeks,
  events,
  availableKinds,
  canViewArSummary,
  canViewApSummary,
  defaultSelectedDayKey,
}: {
  weeks: SerializedCalendarDay[][]
  events: SerializedCalendarEvent[]
  availableKinds: CalendarEventKind[]
  canViewArSummary: boolean
  canViewApSummary: boolean
  defaultSelectedDayKey: string
}) {
  const [activeKind, setActiveKind] = useState<CalendarEventKind | "all">("all")
  const [selectedDayKey, setSelectedDayKey] = useState<string>(defaultSelectedDayKey)

  const filteredEvents = useMemo(() => {
    if (activeKind === "all") return events
    return events.filter((ev) => ev.kind === activeKind)
  }, [events, activeKind])

  const eventsByDay = useMemo(() => {
    const map = new Map<string, SerializedCalendarEvent[]>()
    for (const ev of filteredEvents) {
      const list = map.get(ev.dayKey) ?? []
      list.push(ev)
      map.set(ev.dayKey, list)
    }
    return map
  }, [filteredEvents])

  const countsByKind = useMemo(() => {
    const counts = new Map<CalendarEventKind, number>()
    for (const ev of events) {
      counts.set(ev.kind, (counts.get(ev.kind) ?? 0) + 1)
    }
    return counts
  }, [events])

  const inMonthDayKeys = useMemo(() => {
    const set = new Set<string>()
    for (const week of weeks) {
      for (const day of week) {
        if (day.inMonth) set.add(day.key)
      }
    }
    return set
  }, [weeks])

  const monthlySummary = useMemo(() => {
    let totalInMonth = 0
    let arDueTotal = 0
    let arDueCount = 0
    let apDueTotal = 0
    let apDueCount = 0
    let holidayCount = 0

    for (const ev of events) {
      if (!inMonthDayKeys.has(ev.dayKey)) continue
      totalInMonth += 1
      if (ev.kind === "invoice-due") {
        arDueCount += 1
        arDueTotal += ev.amount ?? 0
      } else if (ev.kind === "bill-due") {
        apDueCount += 1
        apDueTotal += ev.amount ?? 0
      } else if (ev.kind === "holiday") {
        holidayCount += 1
      }
    }

    return { totalInMonth, arDueTotal, arDueCount, apDueTotal, apDueCount, holidayCount }
  }, [events, inMonthDayKeys])

  const selectedDay = useMemo(() => {
    for (const week of weeks) {
      for (const day of week) {
        if (day.key === selectedDayKey) return day
      }
    }
    return weeks[0]?.[0] ?? null
  }, [weeks, selectedDayKey])

  const selectedDayEvents = useMemo(
    () => (selectedDay ? eventsByDay.get(selectedDay.key) ?? [] : []),
    [eventsByDay, selectedDay],
  )

  const monthEventsSorted = useMemo(() => {
    const dayLabelMap = new Map<string, string>()
    for (const week of weeks) {
      for (const day of week) {
        if (day.inMonth) dayLabelMap.set(day.key, day.fullDateLabel)
      }
    }
    return filteredEvents
      .filter((ev) => dayLabelMap.has(ev.dayKey))
      .sort((a, b) => a.dayKey.localeCompare(b.dayKey))
      .map((ev) => ({ ...ev, dateLabel: dayLabelMap.get(ev.dayKey)! }))
  }, [filteredEvents, weeks])

  const summaryCols =
    1 + (canViewArSummary ? 1 : 0) + (canViewApSummary ? 1 : 0) + 1
  const summaryGridClass =
    summaryCols === 4
      ? "grid-cols-2 lg:grid-cols-4"
      : summaryCols === 3
        ? "grid-cols-2 sm:grid-cols-3"
        : "grid-cols-2"

  return (
    <div className="flex flex-col gap-3.5 sm:gap-5">
      {/* Strip Ringkasan Terpadu (2x2 di mobile agar ringkas di atas lipatan) */}
      <dl
        className={`grid overflow-hidden rounded-lg border border-border bg-card shadow-2xs divide-border ${summaryGridClass}`}
      >
        <div className="flex flex-col justify-between gap-1 border-b border-r border-border p-3 sm:p-4 lg:border-b-0">
          <dt className="text-[11px] sm:text-xs font-medium text-muted-foreground">
            Agenda Bulan Ini
          </dt>
          <dd className="text-base sm:text-xl font-semibold text-foreground tabular-nums">
            {monthlySummary.totalInMonth} agenda
          </dd>
        </div>

        {canViewArSummary && (
          <div className="flex flex-col justify-between gap-1 border-b border-border p-3 sm:p-4 lg:border-b-0 lg:border-r">
            <dt className="text-[11px] sm:text-xs font-medium text-muted-foreground">
              Tempo Piutang ({monthlySummary.arDueCount})
            </dt>
            <dd className="text-base sm:text-xl font-semibold text-amber-700 dark:text-amber-400 font-mono tabular-nums truncate">
              {formatCurrencyExact(monthlySummary.arDueTotal)}
            </dd>
          </div>
        )}

        {canViewApSummary && (
          <div className="flex flex-col justify-between gap-1 border-r border-border p-3 sm:p-4">
            <dt className="text-[11px] sm:text-xs font-medium text-muted-foreground">
              Tempo Hutang ({monthlySummary.apDueCount})
            </dt>
            <dd className="text-base sm:text-xl font-semibold text-red-700 dark:text-red-400 font-mono tabular-nums truncate">
              {formatCurrencyExact(monthlySummary.apDueTotal)}
            </dd>
          </div>
        )}

        <div className="flex flex-col justify-between gap-1 p-3 sm:p-4">
          <dt className="text-[11px] sm:text-xs font-medium text-muted-foreground">
            Hari Libur Bulan Ini
          </dt>
          <dd className="text-base sm:text-xl font-semibold text-foreground tabular-nums">
            {monthlySummary.holidayCount} hari
          </dd>
        </div>
      </dl>

      {/* Filter Kategori Interaktif (1 baris geser horizontal di mobile, wrap di desktop) */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1 text-xs sm:mx-0 sm:px-0 sm:pb-0 sm:flex-wrap sm:overflow-visible">
        <span className="inline-flex shrink-0 items-center gap-1.5 text-muted-foreground font-medium">
          <Filter className="size-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Saring:</span>
        </span>
        <button
          type="button"
          onClick={() => setActiveKind("all")}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 min-h-9 font-medium whitespace-nowrap transition-colors cursor-pointer ${
            activeKind === "all"
              ? "border-primary bg-primary text-primary-foreground"
              : "border-default bg-surface text-foreground hover:bg-surface-muted"
          }`}
        >
          Semua
          <span className="tabular-nums opacity-80">({events.length})</span>
        </button>
        {availableKinds.map((kind) => {
          const count = countsByKind.get(kind) ?? 0
          const isSelected = activeKind === kind
          return (
            <button
              key={kind}
              type="button"
              onClick={() => setActiveKind(isSelected ? "all" : kind)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 min-h-9 font-medium whitespace-nowrap transition-colors cursor-pointer ${
                isSelected
                  ? "ring-2 ring-primary/40 " + KIND_STYLES[kind].chip
                  : KIND_STYLES[kind].chip + " hover:opacity-85"
              }`}
            >
              {KIND_STYLES[kind].label}
              <span className="tabular-nums opacity-80">({count})</span>
            </button>
          )
        })}
      </div>

      {/* Grid Kalender (fit 100% di mobile tanpa scroll horizontal) + Panel Agenda Harian */}
      <div className="grid grid-cols-1 gap-4 sm:gap-5 xl:grid-cols-4">
        <div className="xl:col-span-3">
          <div className="w-full rounded-lg border border-default bg-surface shadow-2xs overflow-hidden">
            <div className="grid grid-cols-7 bg-surface-muted border-b border-default">
              {WEEKDAY_LABELS.map((day, index) => (
                <div
                  key={day}
                  className="px-1 py-2 sm:px-2 sm:py-2.5 text-center text-[11px] sm:text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  <span className="hidden sm:inline">{day}</span>
                  <span className="sm:hidden">{WEEKDAY_SHORT[index]}</span>
                </div>
              ))}
            </div>
            {weeks.map((week, weekIndex) => (
              <div
                key={weekIndex}
                className="grid grid-cols-7 border-b border-default last:border-b-0"
              >
                {week.map((day) => {
                  const dayEvents = eventsByDay.get(day.key) ?? []
                  const isSelected = day.key === selectedDay?.key
                  return (
                    <div
                      key={day.key}
                      onClick={() => setSelectedDayKey(day.key)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault()
                          setSelectedDayKey(day.key)
                        }
                      }}
                      aria-label={`Pilih tanggal ${day.fullDateLabel}, ${dayEvents.length} agenda`}
                      className={`min-h-[54px] p-1 sm:min-h-[88px] sm:p-1.5 border-r border-default last:border-r-0 flex flex-col justify-between sm:justify-start gap-1 text-left transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                        isSelected
                          ? "bg-primary/5 ring-1 ring-inset ring-primary/40"
                          : day.inMonth
                            ? "bg-surface hover:bg-surface-muted/40"
                            : "bg-surface-muted/40 hover:bg-surface-muted/60"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-0.5">
                        <span
                          className={`text-[11px] sm:text-xs font-semibold tabular-nums ${
                            day.isToday
                              ? "inline-flex size-5 sm:size-6 items-center justify-center rounded-full bg-primary text-primary-foreground"
                              : day.inMonth
                                ? "text-foreground"
                                : "text-muted-foreground"
                          }`}
                        >
                          {day.dayNumber}
                        </span>
                      </div>

                      {dayEvents.slice(0, 3).map((event) => (
                        <Link
                          key={event.id}
                          href={event.href}
                          onClick={(e) => e.stopPropagation()}
                          title={`${KIND_STYLES[event.kind].label}: ${event.label}${event.amount !== null ? ` - ${event.amountFormatted ?? formatCurrencyExact(event.amount)}` : ""}`}
                          className={`truncate rounded border px-1.5 py-0.5 text-[11px] leading-tight max-sm:hidden hover:opacity-85 ${KIND_STYLES[event.kind].chip}`}
                        >
                          {event.label}
                        </Link>
                      ))}

                      {dayEvents.length > 0 && (
                        <div className="flex items-center gap-0.5 sm:hidden">
                          {dayEvents.slice(0, 3).map((ev) => (
                            <span
                              key={`dot-${ev.id}`}
                              className={`size-1.5 rounded-full ${
                                ev.kind === "holiday"
                                  ? "bg-rose-500"
                                  : ev.kind === "bill" || ev.kind === "bill-due"
                                    ? "bg-red-500"
                                    : ev.kind === "invoice-due"
                                      ? "bg-amber-500"
                                      : ev.kind === "delivery"
                                        ? "bg-emerald-500"
                                        : "bg-primary"
                              }`}
                            />
                          ))}
                          {dayEvents.length > 3 && (
                            <span className="text-[9px] font-semibold text-muted-foreground tabular-nums">
                              +{dayEvents.length - 3}
                            </span>
                          )}
                        </div>
                      )}

                      {dayEvents.length > 3 && (
                        <span className="text-[11px] font-medium text-primary max-sm:hidden tabular-nums">
                          +{dayEvents.length - 3} agenda lagi
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Panel Detail Agenda Harian (Desktop Sidebar + Mobile Bottom Panel) */}
        <aside
          aria-label="Agenda hari terpilih"
          className="rounded-lg border border-default bg-surface shadow-2xs p-4 flex flex-col gap-3 self-start"
        >
          <div className="flex items-center justify-between gap-2 border-b border-default pb-3">
            <div className="flex items-center gap-2">
              <CalendarDays className="size-4 text-primary shrink-0" aria-hidden="true" />
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  {selectedDay?.fullDateLabel ?? "Agenda Harian"}
                </h2>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {selectedDayEvents.length} agenda tercatat
                </p>
              </div>
            </div>
          </div>

          {selectedDayEvents.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              Tidak ada agenda pada tanggal ini.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {selectedDayEvents.map((event) => (
                <li key={event.id}>
                  <Link
                    href={event.href}
                    className="group flex flex-col gap-1.5 rounded-md border border-default bg-background p-2.5 transition-colors hover:bg-surface-muted/60"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${KIND_STYLES[event.kind].chip}`}
                      >
                        {KIND_STYLES[event.kind].label}
                      </span>
                      <ChevronRight
                        className="size-3 text-muted-foreground shrink-0 transition-transform group-hover:translate-x-0.5"
                        aria-hidden="true"
                      />
                    </div>
                    <span className="text-xs font-medium text-foreground break-words">
                      {event.label}
                    </span>
                    {event.amount !== null && (
                      <span className="text-xs font-semibold font-mono tabular-nums text-foreground">
                        {event.amountFormatted ?? formatCurrencyExact(event.amount)}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {monthEventsSorted.length > 0 && (
            <div className="border-t border-default pt-3 mt-1 flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Agenda Bulan Ini ({monthEventsSorted.length})
              </h3>
              <ul className="flex flex-col gap-1.5 max-h-60 overflow-y-auto pr-0.5">
                {monthEventsSorted.map((ev) => (
                  <li key={`m-${ev.id}`}>
                    <button
                      type="button"
                      onClick={() => setSelectedDayKey(ev.dayKey)}
                      className={`w-full text-left flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors cursor-pointer ${
                        ev.dayKey === selectedDay?.key
                          ? "border-primary/40 bg-primary/5"
                          : "border-default bg-background hover:bg-surface-muted/60"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-foreground truncate">{ev.label}</p>
                        <p className="text-[11px] text-muted-foreground tabular-nums">
                          {ev.dayKey.split("-").reverse().join("/")} · {KIND_STYLES[ev.kind].label}
                        </p>
                      </div>
                      <ChevronRight className="size-3 text-muted-foreground shrink-0" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
