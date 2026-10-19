-- P1-6: ruleset statutori berperiode + snapshot per slip + tanggungan.
-- Tarif tak lagi hanya konstanta kode: aturan per key berlaku sejak
-- effectiveFrom (sampai effectiveTo/NULL). Seed = parameter 2024 yang selama
-- ini hardcoded (sumber: komentar kode), agar histori reproduksibel dan
-- perubahan 2026 tercatat sebagai baris baru, bukan edit angka diam-diam.
CREATE TABLE `payroll_statutory_rules` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `key` VARCHAR(64) NOT NULL,
  `value` DECIMAL(20, 6) NOT NULL,
  `effective_from` DATE NOT NULL,
  `effective_to` DATE NULL,
  `source` VARCHAR(255) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `payroll_statutory_rules_key_effective_from_unique` (`key`, `effective_from`)
);

INSERT INTO `payroll_statutory_rules` (`key`, `value`, `effective_from`, `source`) VALUES
  ('bpjs_health_employee_rate', 0.01, '2024-01-01', 'kode: payroll-statutory.service.ts (aturan 2024)'),
  ('bpjs_health_ceiling', 12000000, '2024-01-01', 'kode: payroll-statutory.service.ts (aturan 2024)'),
  ('bpjs_jht_employee_rate', 0.02, '2024-01-01', 'kode: payroll-statutory.service.ts (aturan 2024)'),
  ('bpjs_jp_employee_rate', 0.01, '2024-01-01', 'kode: payroll-statutory.service.ts (aturan 2024)'),
  ('bpjs_jp_ceiling', 10042300, '2024-01-01', 'kode: payroll-statutory.service.ts (aturan 2024)'),
  ('ptkp_single', 54000000, '2024-01-01', 'kode: payroll-statutory.service.ts (PTKP 2024)'),
  ('ptkp_married_extra', 4500000, '2024-01-01', 'kode: payroll-statutory.service.ts (PTKP 2024)'),
  ('occupational_cost_rate', 0.05, '2024-01-01', 'kode: payroll-statutory.service.ts (biaya jabatan)'),
  ('occupational_cost_ceiling_year', 6000000, '2024-01-01', 'kode: payroll-statutory.service.ts (biaya jabatan)');

-- Snapshot parameter per slip: reproduksi hitungan historis walau ruleset berubah.
ALTER TABLE `payrolls`
  ADD COLUMN `statutory_snapshot` JSON NULL;

-- Jumlah tanggungan karyawan (PTKP K/1..K/3). Default 0 = perilaku lama.
ALTER TABLE `employees`
  ADD COLUMN `dependents` INT NOT NULL DEFAULT 0;
