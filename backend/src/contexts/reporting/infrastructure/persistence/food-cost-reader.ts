import { Inject, Injectable } from "@nestjs/common";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { branches } from "../../../branches/infrastructure/persistence/branches.tables";
import { inventoryItems, stockMovements } from "../../../inventory/infrastructure/persistence/inventory.tables";
import { computeFoodCostBucket, type MovementCostRow } from "../../domain/food-cost-calculator";
import type {
  FoodCostReaderPort,
  FoodCostReport,
  FoodCostByBranchReport,
} from "../../domain/ports/food-cost-reader.port";
import { businessDateString } from "../../../../shared/time/business-date";

const RELEVANT_TYPES = ["CONSUMPTION", "PRODUCTION_OUT", "ADJUSTMENT", "STOCK_COUNT", "PRODUCTION_REVERSAL"];

@Injectable()
export class FoodCostReader implements FoodCostReaderPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async getVariance(input: { branchId: string | null; fromTs: Date; toTs: Date }): Promise<FoodCostReport> {
    const rows = await this.db
      .select({
        inventory_item_id: stockMovements.inventory_item_id,
        movement_type: stockMovements.movement_type,
        quantity_delta: stockMovements.quantity_delta,
        total_cost: stockMovements.total_cost,
      })
      .from(stockMovements)
      .where(
        and(
          gte(stockMovements.occurred_at, input.fromTs),
          lte(stockMovements.occurred_at, input.toTs),
          inArray(stockMovements.movement_type, RELEVANT_TYPES),
          input.branchId ? eq(stockMovements.branch_id, input.branchId) : undefined
        )
      );

    const byItem = new Map<string, MovementCostRow[]>();
    for (const row of rows) {
      const list = byItem.get(row.inventory_item_id) ?? [];
      list.push({
        movementType: row.movement_type,
        quantityDelta: Number(row.quantity_delta),
        totalCost: row.total_cost != null ? Number(row.total_cost) : null,
      });
      byItem.set(row.inventory_item_id, list);
    }

    const itemIds = [...byItem.keys()];
    const itemRows =
      itemIds.length > 0
        ? await this.db.select({ id: inventoryItems.id, name: inventoryItems.name }).from(inventoryItems).where(inArray(inventoryItems.id, itemIds))
        : [];
    const nameById = new Map(itemRows.map((r) => [r.id, r.name]));

    const byItemResult = itemIds
      .map((inventoryItemId) => ({
        inventoryItemId,
        itemName: nameById.get(inventoryItemId) ?? inventoryItemId,
        ...computeFoodCostBucket(byItem.get(inventoryItemId)!),
      }))
      .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));

    const allRows: MovementCostRow[] = rows.map((row) => ({
      movementType: row.movement_type,
      quantityDelta: Number(row.quantity_delta),
      totalCost: row.total_cost != null ? Number(row.total_cost) : null,
    }));

    return {
      from: businessDateString(input.fromTs),
      to: businessDateString(input.toTs),
      totals: computeFoodCostBucket(allRows),
      byItem: byItemResult,
    };
  }

  async getByBranch(input: { fromTs: Date; toTs: Date }): Promise<FoodCostByBranchReport> {
    const rows = await this.db
      .select({
        branch_id: stockMovements.branch_id,
        movement_type: stockMovements.movement_type,
        quantity_delta: stockMovements.quantity_delta,
        total_cost: stockMovements.total_cost,
      })
      .from(stockMovements)
      .where(
        and(
          gte(stockMovements.occurred_at, input.fromTs),
          lte(stockMovements.occurred_at, input.toTs),
          inArray(stockMovements.movement_type, RELEVANT_TYPES)
        )
      );

    const byBranch = new Map<string, MovementCostRow[]>();
    for (const row of rows) {
      const list = byBranch.get(row.branch_id) ?? [];
      list.push({
        movementType: row.movement_type,
        quantityDelta: Number(row.quantity_delta),
        totalCost: row.total_cost != null ? Number(row.total_cost) : null,
      });
      byBranch.set(row.branch_id, list);
    }

    const branchIds = [...byBranch.keys()];
    const branchRows =
      branchIds.length > 0 ? await this.db.select({ id: branches.id, name: branches.name }).from(branches).where(inArray(branches.id, branchIds)) : [];
    const nameById = new Map(branchRows.map((r) => [r.id, r.name]));

    const branchReports = branchIds
      .map((branchId) => ({
        branchId,
        branchName: nameById.get(branchId) ?? branchId,
        ...computeFoodCostBucket(byBranch.get(branchId)!),
      }))
      .sort((a, b) => b.theoreticalCost - a.theoreticalCost);

    return {
      from: businessDateString(input.fromTs),
      to: businessDateString(input.toTs),
      branches: branchReports,
    };
  }
}
