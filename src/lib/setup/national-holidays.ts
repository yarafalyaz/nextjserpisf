/**
 * Hari libur NASIONAL Indonesia per SKB 3 Menteri (Menag, Menaker,
 * MenPAN-RB). Hanya libur nasional yang dicatat di sini — tanggal ini
 * tidak memotong jatah cuti tahunan dan tidak dihitung sebagai hari
 * kerja oleh penghitung cuti/lembur.
 *
 * Cuti bersama SENGAJA tidak dimasukkan: untuk sektor swasta sifatnya
 * kebijakan perusahaan (umumnya memotong cuti tahunan bagi yang ikut),
 * jadi HR memutuskannya sendiri lewat Kalender Kerja — mencampurnya ke
 * tabel libur akan membuat hari cuti bersama tidak terpotong dari jatah,
 * yang kebalikan dari perlakuan umumnya.
 *
 * Perbarui daftar ini tiap SKB tahun berikutnya terbit.
 */
export const NATIONAL_HOLIDAYS: { date: string; name: string }[] = [
  // 2026 — SKB 3 Menteri (17 hari libur nasional)
  { date: "2026-01-01", name: "Tahun Baru 2026 Masehi" },
  { date: "2026-01-16", name: "Isra Mikraj Nabi Muhammad SAW" },
  { date: "2026-02-17", name: "Tahun Baru Imlek 2577 Kongzili" },
  { date: "2026-03-19", name: "Hari Suci Nyepi (Tahun Baru Saka 1948)" },
  { date: "2026-03-21", name: "Idul Fitri 1447 Hijriah" },
  { date: "2026-03-22", name: "Idul Fitri 1447 Hijriah" },
  { date: "2026-04-03", name: "Wafat Yesus Kristus" },
  { date: "2026-04-05", name: "Kebangkitan Yesus Kristus (Paskah)" },
  { date: "2026-05-01", name: "Hari Buruh Internasional" },
  { date: "2026-05-14", name: "Kenaikan Yesus Kristus" },
  { date: "2026-05-27", name: "Idul Adha 1447 Hijriah" },
  { date: "2026-05-31", name: "Hari Raya Waisak 2570 BE" },
  { date: "2026-06-01", name: "Hari Lahir Pancasila" },
  { date: "2026-06-16", name: "Tahun Baru Islam 1448 Hijriah" },
  { date: "2026-08-17", name: "Hari Kemerdekaan Republik Indonesia" },
  { date: "2026-08-25", name: "Maulid Nabi Muhammad SAW" },
  { date: "2026-12-25", name: "Kelahiran Yesus Kristus" },
]
