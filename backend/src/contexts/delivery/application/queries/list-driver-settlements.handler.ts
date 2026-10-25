import { Inject, Injectable } from "@nestjs/common";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
import { DriverSettlement } from "../../domain/driver-settlement.aggregate";
import {
  DRIVER_SETTLEMENT_REPOSITORY,
  type DriverSettlementRepositoryPort,
} from "../../domain/ports/driver-settlement-repository.port";

@Injectable()
export class ListDriverSettlementsHandler {
  constructor(@Inject(DRIVER_SETTLEMENT_REPOSITORY) private readonly settlements: DriverSettlementRepositoryPort) {}

  execute(filter?: { driverId?: string; branchId?: string; varianceStatus?: string }, page?: PageRequest): Promise<{ rows: DriverSettlement[]; total: number }> {
    return this.settlements.listPage(filter, page);
  }
}
