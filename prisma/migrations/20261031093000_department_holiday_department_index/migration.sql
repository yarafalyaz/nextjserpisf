-- Drift rantai migrasi: `DepartmentHoliday` dideklarasikan di skema dengan
-- @@index([departmentId], map: "department_holidays_department_id_fkey"),
-- tetapi migrasi yang membuat `department_holidays`
-- (20260527071611_add_document_prefixes) tidak pernah membuat indeks itu —
-- ini drift 1 pernyataan yang ditemukan `npm run db:check-migrations`
-- terhadap scratch DB (rantai penuh tidak mereproduksi skema).
CREATE INDEX `department_holidays_department_id_fkey` ON `department_holidays`(`department_id`);
