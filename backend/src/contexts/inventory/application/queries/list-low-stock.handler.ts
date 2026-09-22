import { Inject, Injectable } from "@nestjs/common";
import { classifyStockLevel, type StockLevelStatus } from "../../domain/stock-level";
import {
  BRANCH_STOCK_THRESHOLD_REPOSITORY,
  type BranchStockThresholdRepositoryPort,
} from "../../domain/ports/branch-stock-threshold-repository.port";

export interface LowStockRow {
  branchId: string;
  inventoryItemId: string;
  itemName: string;
  unit: string;
  quantity: number;
  reorderPoint: number | null;
  status: Exclude<StockLevelStatus, "NORMAL">;
}

@Injectable()
export class ListLowStockHandler {
  constructor(@Inject(BRANCH_STOCK_THRESHOLD_REPOSITORY) private readonly thresholds: BranchStockThresholdRepositoryPort) {}

  async execute(branchId?: string): Promise<LowStockRow[]> {
    const balances = await this.thresholds.listBalancesWithThresholds(branchId);
    const rows: LowStockRow[] = [];
    for (const b of balances) {
      const status = classifyStockLevel(b.quantity, b.reorderPoint);
      if (status === "NORMAL") continue;
      rows.push({
        branchId: b.branchId,
        inventoryItemId: b.inventoryItemId,
        itemName: b.itemName,
        unit: b.unit,
        quantity: b.quantity,
        reorderPoint: b.reorderPoint,
        status,
      });
    }
    return rows.sort((a, b) => a.quantity - b.quantity);
  }
}
