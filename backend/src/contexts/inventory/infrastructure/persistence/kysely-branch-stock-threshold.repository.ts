import { Inject, Injectable } from "@nestjs/common";
import type { Kysely } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { BranchStockThreshold } from "../../domain/branch-stock-threshold.aggregate";
import type {
  BranchStockBalanceWithThreshold,
  BranchStockThresholdRepositoryPort,
} from "../../domain/ports/branch-stock-threshold-repository.port";

@Injectable()
export class KyselyBranchStockThresholdRepository implements BranchStockThresholdRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async get(branchId: string, inventoryItemId: string): Promise<BranchStockThreshold> {
    const row = await this.db
      .selectFrom("branch_stock_thresholds")
      .selectAll()
      .where("branch_id", "=", branchId)
      .where("inventory_item_id", "=", inventoryItemId)
      .executeTakeFirst();

    if (!row) return BranchStockThreshold.default(branchId, inventoryItemId);
    return BranchStockThreshold.reconstitute({
      branchId: row.branch_id,
      inventoryItemId: row.inventory_item_id,
      reorderPoint: row.reorder_point === null ? null : Number(row.reorder_point),
      minStock: row.min_stock === null ? null : Number(row.min_stock),
      maxStock: row.max_stock === null ? null : Number(row.max_stock),
      updatedBy: row.updated_by,
      updatedAt: row.updated_at,
    });
  }

  async save(threshold: BranchStockThreshold): Promise<void> {
    await this.db
      .insertInto("branch_stock_thresholds")
      .values({
        branch_id: threshold.branchId,
        inventory_item_id: threshold.inventoryItemId,
        reorder_point: threshold.reorderPoint,
        min_stock: threshold.minStock,
        max_stock: threshold.maxStock,
        updated_by: threshold.updatedBy,
        updated_at: threshold.updatedAt,
      })
      .onConflict((oc) =>
        oc.columns(["branch_id", "inventory_item_id"]).doUpdateSet({
          reorder_point: threshold.reorderPoint,
          min_stock: threshold.minStock,
          max_stock: threshold.maxStock,
          updated_by: threshold.updatedBy,
          updated_at: threshold.updatedAt,
        })
      )
      .execute();
  }

  async listBalancesWithThresholds(branchId?: string): Promise<BranchStockBalanceWithThreshold[]> {
    let query = this.db
      .selectFrom("branch_stock_balances")
      .innerJoin("inventory_items", "inventory_items.id", "branch_stock_balances.inventory_item_id")
      .leftJoin("branch_stock_thresholds", (join) =>
        join
          .onRef("branch_stock_thresholds.branch_id", "=", "branch_stock_balances.branch_id")
          .onRef("branch_stock_thresholds.inventory_item_id", "=", "branch_stock_balances.inventory_item_id")
      )
      .select([
        "branch_stock_balances.branch_id as branch_id",
        "branch_stock_balances.inventory_item_id as inventory_item_id",
        "inventory_items.name as item_name",
        "inventory_items.unit as unit",
        "branch_stock_balances.quantity as quantity",
        "branch_stock_thresholds.reorder_point as reorder_point",
        "branch_stock_thresholds.min_stock as min_stock",
        "branch_stock_thresholds.max_stock as max_stock",
      ]);
    if (branchId) query = query.where("branch_stock_balances.branch_id", "=", branchId);
    const rows = await query.execute();

    return rows.map((r) => ({
      branchId: r.branch_id,
      inventoryItemId: r.inventory_item_id,
      itemName: r.item_name,
      unit: r.unit,
      quantity: Number(r.quantity),
      reorderPoint: r.reorder_point === null ? null : Number(r.reorder_point),
      minStock: r.min_stock === null ? null : Number(r.min_stock),
      maxStock: r.max_stock === null ? null : Number(r.max_stock),
    }));
  }
}
