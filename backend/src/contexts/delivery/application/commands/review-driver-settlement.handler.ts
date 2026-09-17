import { Inject, Injectable } from "@nestjs/common";
import { DriverSettlement } from "../../domain/driver-settlement.aggregate";
import {
  DRIVER_SETTLEMENT_REPOSITORY,
  type DriverSettlementRepositoryPort,
} from "../../domain/ports/driver-settlement-repository.port";
import { DriverSettlementNotFoundError } from "../../domain/errors";

export interface ReviewDriverSettlementCommand {
  settlementId: string;
  decision: "approve" | "acknowledge";
  notes?: string | null;
  reviewerId: string;
}

@Injectable()
export class ReviewDriverSettlementHandler {
  constructor(@Inject(DRIVER_SETTLEMENT_REPOSITORY) private readonly settlements: DriverSettlementRepositoryPort) {}

  async execute(command: ReviewDriverSettlementCommand): Promise<DriverSettlement> {
    const settlement = await this.settlements.findById(command.settlementId);
    if (!settlement) throw new DriverSettlementNotFoundError();

    settlement.reviewVariance({ decision: command.decision, notes: command.notes, reviewerId: command.reviewerId });
    await this.settlements.save(settlement);
    return settlement;
  }
}
