-- F-2026-10-23-121-V Putusan 1 (vonis BOT 4, PR #637): akun laba ditahan
-- tujuan jurnal penutup tahunan. Nullable fail-closed, TANPA default
-- tebakan — baris existing semua NULL = posting YearEndClosing ditolak
-- berisik sampai operator memetakan akun EQTY laba ditahan di Pengaturan.
ALTER TABLE `system_settings` ADD COLUMN `retained_earnings_account_id` INTEGER NULL;
