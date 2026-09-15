import { Inject, Injectable } from "@nestjs/common";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { StockMovement, type MovementType } from "../../domain/stock-movement.aggregate";
import type {
  RecordMovementResult,
  StockMovementRepositoryPort,
} from "../../domain/ports/stock-movement-repository.port";
import { InsufficientStockError } from "../../domain/errors";
import type { StockMovementsTable } from "./stock-movement.schema";

@Injectable()
export class KyselyStockMovementRepository implements StockMovementRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  // بيسجّل الحركة ويحدّث branch_stock_balances في معاملة واحدة ذرية. بنضمن وجود صف رصيد قبل القفل
  // عليه (INSERT ... ON CONFLICT DO NOTHING بكمية صفر) عشان أول حركة على (فرع، صنف) معينين تتقفل صح
  // من غير race condition - لو صفين اتسجّلوا في نفس اللحظة بالظبط لنفس الصنف/الفرع من غير الضمان ده،
  // ممكن الاتنين يقروا رصيد صفر ويحسبوا نتيجة غلط
  async recordMovement(
    movement: StockMovement,
    options: { allowNegativeBalance: boolean }
  ): Promise<RecordMovementResult> {
    return this.db.transaction().execute(async (trx) => {
      await trx
        .insertInto("branch_stock_balances")
        .values({ branch_id: movement.branchId, inventory_item_id: movement.inventoryItemId, quantity: 0 })
        .onConflict((oc) => oc.columns(["branch_id", "inventory_item_id"]).doNothing())
        .execute();

      const balanceRow = await trx
        .selectFrom("branch_stock_balances")
        .selectAll()
        .where("branch_id", "=", movement.branchId)
        .where("inventory_item_id", "=", movement.inventoryItemId)
        .forUpdate()
        .executeTakeFirstOrThrow();

      const currentBalance = Number(balanceRow.quantity);
      const newBalance = currentBalance + movement.quantityDelta;
      if (newBalance < 0 && !options.allowNegativeBalance) {
        throw new InsufficientStockError();
      }

      await trx.insertInto("stock_movements").values(this.toRow(movement)).execute();
      await trx
        .updateTable("branch_stock_balances")
        .set({ quantity: newBalance })
        .where("branch_id", "=", movement.branchId)
        .where("inventory_item_id", "=", movement.inventoryItemId)
        .execute();

      return { balanceAfter: newBalance };
    });
  }

  async getBalance(branchId: string, inventoryItemId: string): Promise<number> {
    const row = await this.db
      .selectFrom("branch_stock_balances")
      .select("quantity")
      .where("branch_id", "=", branchId)
      .where("inventory_item_id", "=", inventoryItemId)
      .executeTakeFirst();
    return row ? Number(row.quantity) : 0;
  }

  async listMovements(filter?: { inventoryItemId?: string; branchId?: string }): Promise<StockMovement[]> {
    let query = this.db.selectFrom("stock_movements").selectAll();
    if (filter?.inventoryItemId) query = query.where("inventory_item_id", "=", filter.inventoryItemId);
    if (filter?.branchId) query = query.where("branch_id", "=", filter.branchId);
    const rows = await query.orderBy("occurred_at", "desc").execute();
    return rows.map((r) => this.toDomain(r));
  }

  async findByLegacyReferenceKey(key: string): Promise<StockMovement | null> {
    const row = await this.db
      .selectFrom("stock_movements")
      .selectAll()
      .where("legacy_reference_key", "=", key)
      .executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  private toRow(movement: StockMovement) {
    return {
      id: movement.id,
      inventory_item_id: movement.inventoryItemId,
      branch_id: movement.branchId,
      movement_type: movement.movementType,
      quantity_delta: movement.quantityDelta,
      reason: movement.reason,
      reference_type: movement.referenceType,
      reference_id: movement.referenceId,
      performed_by: movement.performedBy,
      occurred_at: movement.occurredAt,
      legacy_reference_key: movement.legacyReferenceKey,
    };
  }

  private toDomain(row: Selectable<StockMovementsTable>): StockMovement {
    return StockMovement.reconstitute(row.id, {
      inventoryItemId: row.inventory_item_id,
      branchId: row.branch_id,
      movementType: row.movement_type as MovementType,
      quantityDelta: Number(row.quantity_delta),
      reason: row.reason,
      referenceType: row.reference_type,
      referenceId: row.reference_id,
      performedBy: row.performed_by,
      occurredAt: row.occurred_at,
      legacyReferenceKey: row.legacy_reference_key,
    });
  }
}
