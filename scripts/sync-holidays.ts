import { prisma } from "../src/lib/db/prisma"
import { syncNationalHolidays } from "../src/lib/services/holiday-sync.service"

/**
 * Sinkronisasi hari libur nasional ke tabel holidays.
 *
 * Pakai:
 *   npm run db:sync-holidays              # tahun berjalan + tahun depan
 *   npm run db:sync-holidays -- 2028      # satu tahun tertentu
 *   npm run db:sync-holidays -- 2027 2028 # beberapa tahun
 *
 * Idempoten: hanya menambah yang belum ada; koreksi manual HR atas
 * estimasi kalender (tanggal Hijriah/Nyepi) tidak pernah ditimpa.
 */
async function main() {
  const args = process.argv.slice(2).map(Number).filter((n) => Number.isInteger(n) && n >= 2000 && n <= 2100)
  const currentYear = new Date().getFullYear()
  const years = args.length > 0 ? args : [currentYear, currentYear + 1]

  const report = await syncNationalHolidays(years)
  for (const y of report.years) {
    console.log(`Tahun ${y.year}: +${y.inserted.length} baru, ${y.skippedExisting} sudah ada`)
    for (const h of y.inserted) {
      console.log(`  + ${h.date} ${h.name}${h.estimated ? " (estimasi — verifikasi SKB)" : ""}`)
    }
  }
  if (report.estimatedInserted.length > 0) {
    console.log(
      `\nPerhatian: ${report.estimatedInserted.length} tanggal estimasi kalender terpasang. ` +
        "Begitu SKB 3 Menteri untuk tahun tersebut terbit, verifikasi tanggal Hijriah/Nyepi di Kalender Kerja.",
    )
  }
  await prisma.$disconnect()
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
