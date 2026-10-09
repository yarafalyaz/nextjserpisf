-- Drop the dead `product_vehicle_models` junction.
--
-- It modelled a product↔model compatibility list, but nothing has queried it
-- since Product gained a direct `vehicleModelId` FK (`Product.vehicleModel`,
-- ON DELETE SET NULL). The table is empty and the junction only survived as a
-- second, drift-prone source of the same "which models does this part fit"
-- fact — and a CASCADE-delete foot-gun for `deleteVehicleModel` (deleting a
-- model would silently wipe every junction row). Removing it leaves
-- `Product.vehicleModelId` as the single source of truth.
DROP TABLE IF EXISTS `product_vehicle_models`;
