import { Inject, Injectable } from "@nestjs/common";
import { DriverSettlement } from "../../domain/driver-settlement.aggregate";
import {
  DRIVER_SETTLEMENT_REPOSITORY,
  type DriverSettlementRepositoryPort,
} from "../../domain/ports/driver-settlement-repository.port";
import { DriverSettlementNotFoundError } from "../../domain/errors";

@Injectable()
export class GetDriverSettlementHandler {
  constructor(@Inject(DRIVER_SETTLEMENT_REPOSITORY) private readonly settlements: DriverSettlementRepositoryPort) {}

  async execute(id: string): Promise<DriverSettlement> {
    const settlement = await this.settlements.findById(id);
    if (!settlement) throw new DriverSettlementNotFoundError();
    return settlement;
  }
}
