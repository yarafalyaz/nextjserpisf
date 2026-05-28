import { prisma } from "../src/lib/db/prisma";

async function main() {
  console.log("=== SEED CHART OF ACCOUNTS STANDAR ===");

  const coaList = [
    // ASSET (HARTA)
    { code: "1-1100", name: "Kas Utama", type: "ASSET", normalBalance: "debit" },
    { code: "1-1110", name: "Kas Kecil", type: "ASSET", normalBalance: "debit" },
    { code: "1-1200", name: "Bank BCA", type: "ASSET", normalBalance: "debit" },
    { code: "1-1300", name: "Piutang Usaha", type: "ASSET", normalBalance: "debit" },
    { code: "1-1310", name: "Piutang Karyawan", type: "ASSET", normalBalance: "debit" },
    { code: "1-1400", name: "Persediaan Barang Dagang", type: "ASSET", normalBalance: "debit" },
    { code: "1-1410", name: "Persediaan Sparepart", type: "ASSET", normalBalance: "debit" },
    { code: "1-1420", name: "Barang Dalam Proses (WIP)", type: "ASSET", normalBalance: "debit" },
    { code: "1-1500", name: "Pajak Dibayar Dimuka (PPN Masukan)", type: "ASSET", normalBalance: "debit" },
    { code: "1-2100", name: "Aset Tetap - Kendaraan", type: "ASSET", normalBalance: "debit" },
    { code: "1-2110", name: "Aset Tetap - Peralatan Bengkel", type: "ASSET", normalBalance: "debit" },
    { code: "1-2200", name: "Akumulasi Penyusutan - Kendaraan", type: "ASSET", normalBalance: "credit" },

    // LIABILITY (KEWAJIBAN)
    { code: "2-1100", name: "Hutang Usaha", type: "LIABILITY", normalBalance: "credit" },
    { code: "2-1200", name: "Hutang Pajak (PPN Keluaran)", type: "LIABILITY", normalBalance: "credit" },
    { code: "2-1300", name: "Hutang Gaji & Upah", type: "LIABILITY", normalBalance: "credit" },
    { code: "2-1400", name: "Uang Muka Pelanggan (Down Payment)", type: "LIABILITY", normalBalance: "credit" },

    // EQUITY (MODAL)
    { code: "3-1000", name: "Modal Disetor", type: "EQUITY", normalBalance: "credit" },
    { code: "3-8000", name: "Laba Ditahan", type: "EQUITY", normalBalance: "credit" },
    { code: "3-9000", name: "Laba Tahun Berjalan", type: "EQUITY", normalBalance: "credit" },

    // REVENUE (PENDAPATAN)
    { code: "4-1000", name: "Pendapatan Penjualan Sparepart", type: "REVENUE", normalBalance: "credit" },
    { code: "4-1100", name: "Pendapatan Jasa Servis", type: "REVENUE", normalBalance: "credit" },
    { code: "4-2000", name: "Retur Penjualan", type: "REVENUE", normalBalance: "debit" },
    { code: "4-3000", name: "Diskon Penjualan", type: "REVENUE", normalBalance: "debit" },

    // COGS (HARGA POKOK)
    { code: "5-1000", name: "Harga Pokok Penjualan (HPP)", type: "EXPENSE", normalBalance: "debit" },
    { code: "5-2000", name: "Beban Pembelian", type: "EXPENSE", normalBalance: "debit" },
    { code: "5-2100", name: "Ongkos Kirim Pembelian", type: "EXPENSE", normalBalance: "debit" },
    { code: "5-3000", name: "Diskon Pembelian", type: "EXPENSE", normalBalance: "credit" },
    { code: "5-4000", name: "Retur Pembelian", type: "EXPENSE", normalBalance: "credit" },

    // EXPENSE (BEBAN OPERASIONAL)
    { code: "6-1000", name: "Beban Gaji & Upah", type: "EXPENSE", normalBalance: "debit" },
    { code: "6-2000", name: "Beban Material (Consumables)", type: "EXPENSE", normalBalance: "debit" },
    { code: "6-3000", name: "Beban Utilitas (Listrik, Air)", type: "EXPENSE", normalBalance: "debit" },
    { code: "6-4000", name: "Beban Sewa", type: "EXPENSE", normalBalance: "debit" },
    { code: "6-5000", name: "Beban Penyusutan Aset", type: "EXPENSE", normalBalance: "debit" },
    { code: "6-6000", name: "Beban Umum & Administrasi", type: "EXPENSE", normalBalance: "debit" },
    { code: "6-7000", name: "Beban Penyesuaian Persediaan (Inventory Adj)", type: "EXPENSE", normalBalance: "debit" },
  ];

  let added = 0;
  for (const acc of coaList) {
    const exists = await prisma.account.findUnique({ where: { code: acc.code } });
    if (!exists) {
      await prisma.account.create({
        data: {
          code: acc.code,
          name: acc.name,
          type: acc.type as any,
          normalBalance: acc.normalBalance,
          isActive: true
        }
      });
      added++;
      console.log(`Created: ${acc.code} - ${acc.name}`);
    } else {
      console.log(`Exists: ${acc.code} - ${acc.name}`);
    }
  }

  console.log(`\n✅ Done! Added ${added} new accounts.`);
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
