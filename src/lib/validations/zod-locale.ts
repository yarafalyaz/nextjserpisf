import { z } from "zod";

// Locale global Zod: pesan bawaan (tanpa pesan kustom di schema) harus
// Bahasa Indonesia di semua jalur parse (server action, API, test).
// Modul side-effect ini diimpor oleh parse-form.ts dan setiap file
// *.schemas.ts, jadi config terpasang sebelum parse apa pun dijalankan
// (z.config berlaku global saat parse, bukan saat schema dibuat).
z.config(z.locales.id());
