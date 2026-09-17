import { Inject, Injectable } from "@nestjs/common";
import { DriverSettlement } from "../../domain/driver-settlement.aggregate";
import {
  DRIVER_SETTLEMENT_REPOSITORY,
  type DriverSettlementRepositoryPort,
} from "../../domain/ports/driver-settlement-repository.port";

@Injectable()
export class ListDriverSettlementsHandler {
  constructor(@Inject(DRIVER_SETTLEMENT_REPOSITORY) private readonly settlements: DriverSettlementRepositoryPort) {}

  execute(filter?: { driverId?: string; branchId?: string; varianceStatus?: string }): Promise<DriverSettlement[]> {
    return this.settlements.list(filter);
  }
}
