import { Inject, Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { BranchStockThreshold } from "../../domain/branch-stock-threshold.aggregate";
import type {
  BranchStockBalanceWithThreshold,
  BranchStockThresholdRepositoryPort,
} from "../../domain/ports/branch-stock-threshold-repository.port";
import { branchStockBalances, branchStockThresholds, inventoryItems } from "./inventory.tables";

@Injectable()
export class BranchStockThresholdRepository implements BranchStockThresholdRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async get(branchId: string, inventoryItemId: string): Promise<BranchStockThreshold> {
    const [row] = await this.db
      .select()
      .from(branchStockThresholds)
      .where(and(eq(branchStockThresholds.branch_id, branchId), eq(branchStockThresholds.inventory_item_id, inventoryItemId)))
      .limit(1);

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
      .insert(branchStockThresholds)
      .values({
        branch_id: threshold.branchId,
        inventory_item_id: threshold.inventoryItemId,
        reorder_point: threshold.reorderPoint,
        min_stock: threshold.minStock,
        max_stock: threshold.maxStock,
        updated_by: threshold.updatedBy,
        updated_at: threshold.updatedAt,
      })
      .onConflictDoUpdate({
        target: [branchStockThresholds.branch_id, branchStockThresholds.inventory_item_id],
        set: {
          reorder_point: threshold.reorderPoint,
          min_stock: threshold.minStock,
          max_stock: threshold.maxStock,
          updated_by: threshold.updatedBy,
          updated_at: threshold.updatedAt,
        },
      });
  }

  async listBalancesWithThresholds(branchId?: string): Promise<BranchStockBalanceWithThreshold[]> {
    const rows = await this.db
      .select({
        branch_id: branchStockBalances.branch_id,
        inventory_item_id: branchStockBalances.inventory_item_id,
        item_name: inventoryItems.name,
        unit: inventoryItems.unit,
        quantity: branchStockBalances.quantity,
        reorder_point: branchStockThresholds.reorder_point,
        min_stock: branchStockThresholds.min_stock,
        max_stock: branchStockThresholds.max_stock,
      })
      .from(branchStockBalances)
      .innerJoin(inventoryItems, eq(inventoryItems.id, branchStockBalances.inventory_item_id))
      .leftJoin(
        branchStockThresholds,
        and(
          eq(branchStockThresholds.branch_id, branchStockBalances.branch_id),
          eq(branchStockThresholds.inventory_item_id, branchStockBalances.inventory_item_id)
        )
      )
      .where(branchId ? eq(branchStockBalances.branch_id, branchId) : undefined);

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
