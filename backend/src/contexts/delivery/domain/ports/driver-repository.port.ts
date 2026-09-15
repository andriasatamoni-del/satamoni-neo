import type { Driver } from "../driver.aggregate";

export interface DriverRepositoryPort {
  save(driver: Driver): Promise<void>;
  findById(id: string): Promise<Driver | null>;
  findByLegacyDriverId(legacyId: number): Promise<Driver | null>;
  list(filter?: { branchId?: string }): Promise<Driver[]>;
}

export const DRIVER_REPOSITORY = Symbol("DRIVER_REPOSITORY");
