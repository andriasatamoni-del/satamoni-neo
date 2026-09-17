import { Inject, Injectable } from "@nestjs/common";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { Stocktake } from "../../domain/stocktake.aggregate";
import type { StocktakeRepositoryPort } from "../../domain/ports/stocktake-repository.port";
import type { StocktakeLinesTable, StocktakesTable } from "./stocktake.schema";

@Injectable()
export class KyselyStocktakeRepository implements StocktakeRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async save(stocktake: Stocktake): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      await trx
        .insertInto("stocktakes")
        .values({
          id: stocktake.id,
          branch_id: stocktake.branchId,
          created_by: stocktake.createdBy,
          notes: stocktake.notes,
          total_variance_value: stocktake.totalVarianceValue,
          created_at: stocktake.createdAt,
        })
        .onConflict((oc) => oc.column("id").doUpdateSet({ total_variance_value: stocktake.totalVarianceValue }))
        .execute();

      for (const line of stocktake.lines) {
        await trx
          .insertInto("stocktake_lines")
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
          .onConflict((oc) => oc.column("id").doUpdateSet({ inventory_movement_id: line.inventoryMovementId }))
          .execute();
      }
    });
  }

  async findById(id: string): Promise<Stocktake | null> {
    const row = await this.db.selectFrom("stocktakes").selectAll().where("id", "=", id).executeTakeFirst();
    if (!row) return null;
    return this.toDomain(row, await this.loadLines(id));
  }

  async list(filter?: { branchId?: string }): Promise<Stocktake[]> {
    let query = this.db.selectFrom("stocktakes").selectAll();
    if (filter?.branchId) query = query.where("branch_id", "=", filter.branchId);
    const rows = await query.orderBy("created_at", "desc").execute();
    const stocktakes: Stocktake[] = [];
    for (const row of rows) stocktakes.push(this.toDomain(row, await this.loadLines(row.id)));
    return stocktakes;
  }

  private loadLines(stocktakeId: string): Promise<Selectable<StocktakeLinesTable>[]> {
    return this.db.selectFrom("stocktake_lines").selectAll().where("stocktake_id", "=", stocktakeId).execute();
  }

  private toDomain(row: Selectable<StocktakesTable>, lineRows: Selectable<StocktakeLinesTable>[]): Stocktake {
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
