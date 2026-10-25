import { Inject, Injectable } from "@nestjs/common";
import { count, desc, eq } from "drizzle-orm";
import { paginate, totalOf } from "../../../../shared/database/pagination";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { Stocktake } from "../../domain/stocktake.aggregate";
import type { StocktakeRepositoryPort } from "../../domain/ports/stocktake-repository.port";
import { stocktakeLines, stocktakes } from "./inventory.tables";

@Injectable()
export class StocktakeRepository implements StocktakeRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(stocktake: Stocktake): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .insert(stocktakes)
        .values({
          id: stocktake.id,
          branch_id: stocktake.branchId,
          created_by: stocktake.createdBy,
          notes: stocktake.notes,
          total_variance_value: stocktake.totalVarianceValue,
          created_at: stocktake.createdAt,
        })
        .onConflictDoUpdate({ target: stocktakes.id, set: { total_variance_value: stocktake.totalVarianceValue } });

      for (const line of stocktake.lines) {
        await tx
          .insert(stocktakeLines)
          .values({
            id: line.id,
            stocktake_id: stocktake.id,
            inventory_item_id: line.inventoryItemId,
            system_quantity: line.systemQuantity,
            actual_quantity: line.actualQuantity,
            variance_quantity: line.varianceQuantity,
            unit_cost: line.unitCost,
            variance_value: line.varianceValue,
            reason: line.reason,
            charge_account_code: line.chargeAccountCode,
            inventory_movement_id: line.inventoryMovementId,
          })
          .onConflictDoUpdate({ target: stocktakeLines.id, set: { inventory_movement_id: line.inventoryMovementId } });
      }
    });
  }

  async findById(id: string): Promise<Stocktake | null> {
    const [row] = await this.db.select().from(stocktakes).where(eq(stocktakes.id, id)).limit(1);
    if (!row) return null;
    return this.toDomain(row, await this.loadLines(id));
  }

  async list(filter?: { branchId?: string }): Promise<Stocktake[]> {
    return (await this.listPage(filter)).rows;
  }

  async listPage(filter?: { branchId?: string }, page?: PageRequest): Promise<{ rows: Stocktake[]; total: number }> {
    const where = filter?.branchId ? eq(stocktakes.branch_id, filter.branchId) : undefined;
    const query = this.db.select().from(stocktakes).where(where).orderBy(desc(stocktakes.created_at), desc(stocktakes.id)).$dynamic();
    const { rows, total } = await paginate(query, page, async () => totalOf(await this.db.select({ total: count() }).from(stocktakes).where(where)));
    const result: Stocktake[] = [];
    for (const row of rows) result.push(this.toDomain(row, await this.loadLines(row.id)));
    return { rows: result, total };
  }

  private loadLines(stocktakeId: string): Promise<(typeof stocktakeLines.$inferSelect)[]> {
    return this.db.select().from(stocktakeLines).where(eq(stocktakeLines.stocktake_id, stocktakeId));
  }

  private toDomain(row: typeof stocktakes.$inferSelect, lineRows: (typeof stocktakeLines.$inferSelect)[]): Stocktake {
    return Stocktake.reconstitute(row.id, {
      branchId: row.branch_id,
      createdBy: row.created_by,
      notes: row.notes,
      lines: lineRows.map((l) => ({
        id: l.id,
        inventoryItemId: l.inventory_item_id,
        systemQuantity: Number(l.system_quantity),
        actualQuantity: Number(l.actual_quantity),
        varianceQuantity: Number(l.variance_quantity),
        unitCost: l.unit_cost === null ? null : Number(l.unit_cost),
        varianceValue: l.variance_value === null ? null : Number(l.variance_value),
        reason: l.reason,
        chargeAccountCode: l.charge_account_code,
        inventoryMovementId: l.inventory_movement_id,
      })),
      totalVarianceValue: Number(row.total_variance_value),
      createdAt: row.created_at,
    });
  }
}
