import { Inject, Injectable } from "@nestjs/common";
import { BranchStockThreshold } from "../../domain/branch-stock-threshold.aggregate";
import {
  BRANCH_STOCK_THRESHOLD_REPOSITORY,
  type BranchStockThresholdRepositoryPort,
} from "../../domain/ports/branch-stock-threshold-repository.port";

export interface UpdateStockThresholdCommand {
  branchId: string;
  inventoryItemId: string;
  reorderPoint?: number | null;
  minStock?: number | null;
  maxStock?: number | null;
  updatedBy: string | null;
}

@Injectable()
export class UpdateStockThresholdHandler {
  constructor(@Inject(BRANCH_STOCK_THRESHOLD_REPOSITORY) private readonly thresholds: BranchStockThresholdRepositoryPort) {}

  async execute(command: UpdateStockThresholdCommand): Promise<BranchStockThreshold> {
    const threshold = await this.thresholds.get(command.branchId, command.inventoryItemId);
    threshold.update(command);
    await this.thresholds.save(threshold);
    return threshold;
  }
}
