import { prisma } from "../src/lib/db/prisma"

const defaultCategories = [
  { name: "operasional", label: "Operasional", sortOrder: 10 },
  { name: "transportasi", label: "Transportasi", sortOrder: 20 },
  { name: "makan", label: "Makan & Minum", sortOrder: 30 },
  { name: "utilitas", label: "Utilitas", sortOrder: 40 },
  { name: "marketing", label: "Pemasaran", sortOrder: 50 },
  { name: "maintenance", label: "Pemeliharaan", sortOrder: 60 },
  { name: "lainnya", label: "Lainnya", sortOrder: 999 },
  { name: "csr", label: "CSR / Donasi", sortOrder: 70 },
  { name: "perbaikan_gedung", label: "Perbaikan Gedung", sortOrder: 80 },
  { name: "iuran_lingkungan", label: "Iuran Lingkungan", sortOrder: 90 },
  { name: "keamanan", label: "Keamanan & Kebersihan", sortOrder: 100 },
  { name: "pendidikan", label: "Pendidikan & Pelatihan", sortOrder: 110 },
  { name: "perjalanan_dinas", label: "Perjalanan Dinas", sortOrder: 120 },
  { name: "sewa", label: "Sewa", sortOrder: 130 },
  { name: "asuransi", label: "Asuransi", sortOrder: 140 },
  { name: "konsumsi", label: "Konsumsi", sortOrder: 150 },
]

async function main() {
  for (const cat of defaultCategories) {
    await prisma.expenseCategory.upsert({
      where: { name: cat.name },
      update: { label: cat.label, sortOrder: cat.sortOrder },
      create: cat,
    })
  }
  console.log(`✅ ${defaultCategories.length} expense categories seeded`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
