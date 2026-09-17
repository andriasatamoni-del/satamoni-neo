import type { DriverSettlement } from "../driver-settlement.aggregate";

export interface DriverSettlementRepositoryPort {
  save(settlement: DriverSettlement): Promise<void>;
  findById(id: string): Promise<DriverSettlement | null>;
  list(filter?: { driverId?: string; branchId?: string; varianceStatus?: string }): Promise<DriverSettlement[]>;
}

export const DRIVER_SETTLEMENT_REPOSITORY = Symbol("DRIVER_SETTLEMENT_REPOSITORY");
