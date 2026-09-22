import { Inject, Injectable } from "@nestjs/common";
import { BranchStockThreshold } from "../../domain/branch-stock-threshold.aggregate";
import {
  BRANCH_STOCK_THRESHOLD_REPOSITORY,
  type BranchStockThresholdRepositoryPort,
} from "../../domain/ports/branch-stock-threshold-repository.port";

@Injectable()
export class GetStockThresholdHandler {
  constructor(@Inject(BRANCH_STOCK_THRESHOLD_REPOSITORY) private readonly thresholds: BranchStockThresholdRepositoryPort) {}

  execute(branchId: string, inventoryItemId: string): Promise<BranchStockThreshold> {
    return this.thresholds.get(branchId, inventoryItemId);
  }
}
