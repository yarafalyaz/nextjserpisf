import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * vercel.json menjadwalkan tiga path cron; Vercel Cron memanggil dengan GET.
 * Handler yang hanya mengekspor POST menjawab 405 di platform itu dan job
 * tidak pernah jalan. GET harus mendelegasi handler yang sama — gerbang
 * CRON_SECRET di dalamnya method-agnostic, jadi tanpa secret tetap 401.
 */

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/services/notification.service", () => ({ notificationService: {} }))
vi.mock("@/lib/services/daily-attendance.service", () => ({ getDailyAttendanceMetrics: vi.fn() }))
vi.mock("@/lib/reports/min-stock-warehouse-alert", () => ({ loadWarehouseLowStock: vi.fn() }))

import { GET as autoRejectGET, POST as autoRejectPOST } from "../auto-reject-quotations/route"
import { GET as depreciationGET, POST as depreciationPOST } from "../asset-depreciation/route"
import { GET as dailyGET, POST as dailyPOST } from "../daily-notifications/route"

describe("cron terjadwal Vercel menerima GET", () => {
  beforeEach(() => {
    delete process.env.CRON_SECRET
    delete process.env.CRON_CREDENTIAL
  })

  it("GET adalah handler yang sama dengan POST di ketiga route", () => {
    expect(autoRejectGET).toBe(autoRejectPOST)
    expect(depreciationGET).toBe(depreciationPOST)
    expect(dailyGET).toBe(dailyPOST)
  })

  it("GET tanpa CRON_SECRET terkonfigurasi tetap 401 (fail-closed)", async () => {
    const req = () => new Request("http://localhost/api/cron/x")
    expect((await autoRejectGET(req())).status).toBe(401)
    expect((await depreciationGET(req())).status).toBe(401)
    expect((await dailyGET(req())).status).toBe(401)
  })
})
