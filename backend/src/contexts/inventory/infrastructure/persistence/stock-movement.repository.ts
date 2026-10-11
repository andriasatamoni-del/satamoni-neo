import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { StockMovement, type MovementType } from "../../domain/stock-movement.aggregate";
import type {
  RecordMovementResult,
  StockMovementRepositoryPort,
} from "../../domain/ports/stock-movement-repository.port";
import { InsufficientStockError } from "../../domain/errors";
import { branchStockBalances, stockMovements } from "./inventory.tables";

@Injectable()
export class StockMovementRepository implements StockMovementRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  // بيسجّل الحركة ويحدّث branch_stock_balances في معاملة واحدة ذرية. بنضمن وجود صف رصيد قبل القفل
  // عليه (INSERT ... ON CONFLICT DO NOTHING بكمية صفر) عشان أول حركة على (فرع، صنف) معينين تتقفل صح
  // من غير race condition - لو صفين اتسجّلوا في نفس اللحظة بالظبط لنفس الصنف/الفرع من غير الضمان ده،
  // ممكن الاتنين يقروا رصيد صفر ويحسبوا نتيجة غلط
  async recordMovement(
    movement: StockMovement,
    options: { allowNegativeBalance: boolean }
  ): Promise<RecordMovementResult> {
    return this.db.transaction(async (tx) => {
      await tx
        .insert(branchStockBalances)
        .values({ branch_id: movement.branchId, inventory_item_id: movement.inventoryItemId, quantity: 0 })
        .onConflictDoNothing({ target: [branchStockBalances.branch_id, branchStockBalances.inventory_item_id] });

      const balanceWhere = and(
        eq(branchStockBalances.branch_id, movement.branchId),
        eq(branchStockBalances.inventory_item_id, movement.inventoryItemId)
      );
      const [balanceRow] = await tx.select().from(branchStockBalances).where(balanceWhere).for("update");
      if (!balanceRow) throw new Error("branch_stock_balances row missing after upsert");

      const currentBalance = Number(balanceRow.quantity);
      const newBalance = currentBalance + movement.quantityDelta;
      if (newBalance < 0 && !options.allowNegativeBalance) {
        throw new InsufficientStockError();
      }

      await tx.insert(stockMovements).values(this.toRow(movement));
      await tx.update(branchStockBalances).set({ quantity: newBalance }).where(balanceWhere);

      return { balanceAfter: newBalance };
    });
  }

  async getBalance(branchId: string, inventoryItemId: string): Promise<number> {
    const [row] = await this.db
      .select({ quantity: branchStockBalances.quantity })
      .from(branchStockBalances)
      .where(and(eq(branchStockBalances.branch_id, branchId), eq(branchStockBalances.inventory_item_id, inventoryItemId)))
      .limit(1);
    return row ? Number(row.quantity) : 0;
  }

  async listMovements(filter?: { inventoryItemId?: string; branchId?: string }): Promise<StockMovement[]> {
    const rows = await this.db
      .select()
      .from(stockMovements)
      .where(
        and(
          filter?.inventoryItemId ? eq(stockMovements.inventory_item_id, filter.inventoryItemId) : undefined,
          filter?.branchId ? eq(stockMovements.branch_id, filter.branchId) : undefined
        )
      )
      .orderBy(desc(stockMovements.occurred_at));
    return rows.map((r) => this.toDomain(r));
  }

  async findByLegacyReferenceKey(key: string): Promise<StockMovement | null> {
    const [row] = await this.db.select().from(stockMovements).where(eq(stockMovements.legacy_reference_key, key)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async listByReference(referenceType: string, referenceId: string): Promise<StockMovement[]> {
    const rows = await this.db
      .select()
      .from(stockMovements)
      .where(and(eq(stockMovements.reference_type, referenceType), eq(stockMovements.reference_id, referenceId)))
      .orderBy(asc(stockMovements.occurred_at));
    return rows.map((r) => this.toDomain(r));
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
      unit_cost: movement.unitCost,
      total_cost: movement.totalCost,
    };
  }

  private toDomain(row: typeof stockMovements.$inferSelect): StockMovement {
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
      unitCost: row.unit_cost != null ? Number(row.unit_cost) : null,
      totalCost: row.total_cost != null ? Number(row.total_cost) : null,
    });
  }
}
