-- Tagihan vendor jasa maklon (coating/bending) ikut HPP proyek.
ALTER TABLE vendor_bills ADD COLUMN project_id INT NULL;
ALTER TABLE vendor_bills ADD CONSTRAINT vendor_bills_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX vendor_bills_project_id_idx ON vendor_bills(project_id);
