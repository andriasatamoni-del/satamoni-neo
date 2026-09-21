import type { KitchenStation } from "../kitchen-station.aggregate";

export interface KitchenStationRepositoryPort {
  save(station: KitchenStation): Promise<void>;
  findById(id: string): Promise<KitchenStation | null>;
  listByBranch(branchId: string): Promise<KitchenStation[]>;
  delete(id: string): Promise<void>;
}

export const KITCHEN_STATION_REPOSITORY = Symbol("KITCHEN_STATION_REPOSITORY");
