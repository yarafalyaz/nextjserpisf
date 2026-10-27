// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

import type { Root } from "react-dom/client"

import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"
import { RecurringDueQueueCard } from "../recurring-due-queue-card"
import {
  buildRecurringDueQueue,
  RECURRING_DUE_BUCKET_LABELS,
  RECURRING_DUE_NEVER_RAN_LABEL,
  RECURRING_DUE_NOTICE_TEXT,
  RECURRING_DUE_STALE_DAYS,
  RECURRING_DUE_TITLE,
  type RecurringDueInput,
} from "@/lib/reports/recurring-due-queue"
import { getWibTodayUtcDate } from "@/lib/utils/attendance-time"
import { formatDate } from "@/lib/utils/format"

const NOW = new Date("2026-10-25T22:00:00.000Z")
const TODAY = getWibTodayUtcDate(NOW)
const day = (offset: number) => new Date(TODAY.getTime() + offset * 86_400_000)

function input(overrides: Partial<RecurringDueInput> = {}): RecurringDueInput {
  return {
    scheduleId: 1,
    slug: "jadwal-1",
    name: "Jurnal Sewa Bulanan",
    type: "journal",
    frequency: "monthly",
    interval: 1,
    nextRunDate: day(-1),
    endDate: null,
    lastRunAt: day(-30),
    runCount: 3,
    lastResult: "Jurnal DRAFT dibuat",
    isActive: true,
    deletedAt: null,
    ...overrides,
  }
}

function render(node: React.ReactNode) {
  const { container, root } = renderCard(node)
  roots.push(root)
  return container
}

let roots: Root[] = []
afterEach(() => {
  roots.forEach((root) => unmountCard(root))
  roots = []
  clearRenderedCards()
})

describe("RecurringDueQueueCard F-2026-10-27-103-S", () => {
  it("judul/notice/ember/tingkat verbatim payload; label umur 'seharusnya jalan sejak', bukan 'gagal selama'", () => {
    const queue = buildRecurringDueQueue(
      [
        input({ scheduleId: 1, lastResult: "Gagal: Jenis transaksi berulang tidak dikenal" }),
        input({ scheduleId: 2, lastResult: null, lastRunAt: null, runCount: 0 }),
      ],
      NOW,
    )
    const container = render(<RecurringDueQueueCard queue={queue} />)
    const text = container.textContent ?? ""

    expect(text).toContain(RECURRING_DUE_TITLE)
    expect(text).toContain(RECURRING_DUE_NOTICE_TEXT)
    expect(text).toContain(RECURRING_DUE_BUCKET_LABELS.GAGAL_JALAN)
    expect(text).toContain(RECURRING_DUE_BUCKET_LABELS.JATUH_TEMPO_BELUM_JALAN)
    expect(text).toContain("Gagal: Jenis transaksi berulang tidak dikenal")
    expect(text).toContain(RECURRING_DUE_NEVER_RAN_LABEL)
    expect(text).toContain("Seharusnya Jalan Sejak")
    expect(text).toContain(formatDate(day(-1)))
    expect(text).not.toMatch(/gagal selama/i)
  })

  it("ambang mengendap dari payload; nol tombol tulis; tautan ke master existing", () => {
    const queue = buildRecurringDueQueue(
      [
        input({ scheduleId: 1, nextRunDate: day(-RECURRING_DUE_STALE_DAYS) }),
        input({ scheduleId: 2, nextRunDate: day(0) }),
      ],
      NOW,
    )
    const container = render(<RecurringDueQueueCard queue={queue} />)
    const text = container.textContent ?? ""
    const html = container.innerHTML

    expect(text).toContain("Mengendap")
    expect(text).toContain("Menunggu")
    expect(container.querySelector("button")).toBeNull()
    expect(html).not.toMatch(/<button|type="submit"|Jalankan Semua/i)
    expect(container.querySelector('a[href="/pengaturan/transaksi-berulang/jadwal-1"]')).not.toBeNull()
  })

  it("skor/rupiah/template/nominal tidak tampil; antrean kosong jujur", () => {
    const queue = buildRecurringDueQueue([input({ nextRunDate: day(1) })], NOW)
    expect(queue.rows).toEqual([])
    const container = render(<RecurringDueQueueCard queue={queue} />)
    const text = container.textContent ?? ""
    expect(text).toContain("Belum ada jadwal transaksi berulang yang jatuh tempo")
    expect(text).not.toMatch(/Rp|template|nominal/i)
  })
})
