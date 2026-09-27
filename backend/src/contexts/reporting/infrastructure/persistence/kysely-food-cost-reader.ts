import { Inject, Injectable } from "@nestjs/common";
import type { Kysely } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { computeFoodCostBucket, type MovementCostRow } from "../../domain/food-cost-calculator";
import type {
  FoodCostReaderPort,
  FoodCostReport,
  FoodCostByBranchReport,
} from "../../domain/ports/food-cost-reader.port";

const RELEVANT_TYPES = ["CONSUMPTION", "PRODUCTION_OUT", "ADJUSTMENT", "STOCK_COUNT", "PRODUCTION_REVERSAL"];

@Injectable()
export class KyselyFoodCostReader implements FoodCostReaderPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async getVariance(input: { branchId: string | null; fromTs: Date; toTs: Date }): Promise<FoodCostReport> {
    let query = this.db
      .selectFrom("stock_movements")
      .select(["inventory_item_id", "movement_type", "quantity_delta", "total_cost"])
      .where("occurred_at", ">=", input.fromTs)
      .where("occurred_at", "<=", input.toTs)
      .where("movement_type", "in", RELEVANT_TYPES);
    if (input.branchId) query = query.where("branch_id", "=", input.branchId);
    const rows = await query.execute();

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
    const itemRows = itemIds.length > 0
      ? await this.db.selectFrom("inventory_items").select(["id", "name"]).where("id", "in", itemIds).execute()
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
      from: input.fromTs.toISOString().slice(0, 10),
      to: input.toTs.toISOString().slice(0, 10),
      totals: computeFoodCostBucket(allRows),
      byItem: byItemResult,
    };
  }

  async getByBranch(input: { fromTs: Date; toTs: Date }): Promise<FoodCostByBranchReport> {
    const rows = await this.db
      .selectFrom("stock_movements")
      .select(["branch_id", "movement_type", "quantity_delta", "total_cost"])
      .where("occurred_at", ">=", input.fromTs)
      .where("occurred_at", "<=", input.toTs)
      .where("movement_type", "in", RELEVANT_TYPES)
      .execute();

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
    const branchRows = branchIds.length > 0
      ? await this.db.selectFrom("branches").select(["id", "name"]).where("id", "in", branchIds).execute()
      : [];
    const nameById = new Map(branchRows.map((r) => [r.id, r.name]));

    const branches = branchIds
      .map((branchId) => ({
        branchId,
        branchName: nameById.get(branchId) ?? branchId,
        ...computeFoodCostBucket(byBranch.get(branchId)!),
      }))
      .sort((a, b) => b.theoreticalCost - a.theoreticalCost);

    return {
      from: input.fromTs.toISOString().slice(0, 10),
      to: input.toTs.toISOString().slice(0, 10),
      branches,
    };
  }
}
