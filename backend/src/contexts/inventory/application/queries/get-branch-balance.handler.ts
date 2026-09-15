import { Inject, Injectable } from "@nestjs/common";
import {
  STOCK_MOVEMENT_REPOSITORY,
  type StockMovementRepositoryPort,
} from "../../domain/ports/stock-movement-repository.port";

@Injectable()
export class GetBranchBalanceHandler {
  constructor(@Inject(STOCK_MOVEMENT_REPOSITORY) private readonly movements: StockMovementRepositoryPort) {}

  async execute(branchId: string, inventoryItemId: string): Promise<number> {
    return this.movements.getBalance(branchId, inventoryItemId);
  }
}
