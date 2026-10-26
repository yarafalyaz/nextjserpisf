// @vitest-environment jsdom
/** Fixture bersama tes seksi pengiriman statement (WA/Email) — cegah duplikasi Sonar. */
export const STATEMENT_PERIOD = {
  periodStart: new Date("2026-01-01T00:00:00.000Z"),
  periodEnd: new Date("2026-10-15T00:00:00.000Z"),
  periodLabel: "Periode 1 Jan 2026 – 15 Okt 2026",
}
export const STATEMENT_CUSTOMER = { id: 7, name: "CV Uji" }
export const STATEMENT_TRAIL = [
  { userName: "Sari", createdAt: new Date("2026-10-21T03:00:00.000Z") },
  { userName: null, createdAt: new Date("2026-10-20T03:00:00.000Z") },
]
