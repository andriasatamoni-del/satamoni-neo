import type { Driver } from "../driver.aggregate";
import type { PageRequest } from "../../../../shared/http/list-query.dto";

// NEO-6: filters of the drivers list. `q` matches the name or phone.
export interface DriverListFilter {
  branchId?: string;
  status?: string;
  q?: string;
  sort?: string;
  order?: "asc" | "desc";
}

export interface DriverRepositoryPort {
  save(driver: Driver): Promise<void>;
  findById(id: string): Promise<Driver | null>;
  findByLegacyDriverId(legacyId: number): Promise<Driver | null>;
  list(filter?: { branchId?: string }): Promise<Driver[]>;
  search(filter: DriverListFilter, page?: PageRequest): Promise<{ drivers: Driver[]; total: number }>;
}

export const DRIVER_REPOSITORY = Symbol("DRIVER_REPOSITORY");
