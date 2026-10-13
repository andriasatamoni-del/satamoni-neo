import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { ConversionOrder, type ConversionOrderStatus } from "../../domain/conversion-order.aggregate";
import type { ConversionOrderRepositoryPort } from "../../domain/ports/conversion-order-repository.port";
import { conversionOrderInputLines, conversionOrders } from "./production.tables";

@Injectable()
export class ConversionOrderRepository implements ConversionOrderRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(order: ConversionOrder): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .insert(conversionOrders)
        .values({
          id: order.id,
          branch_id: order.branchId,
          recipe_id: order.recipeId,
          recipe_version_id: order.recipeVersionId,
          output_item_id: order.outputItemId,
          status: order.status,
          planned_output_quantity: order.plannedOutputQuantity,
          actual_output_quantity: order.actualOutputQuantity,
          output_unit_cost: order.outputUnitCost,
          output_movement_id: order.outputMovementId,
          variance_reason: order.varianceReason,
          notes: order.notes,
          created_by: order.createdBy,
          approved_by: order.approvedBy,
          completed_by: order.completedBy,
          cancelled_by: order.cancelledBy,
          approved_at: order.approvedAt,
          started_at: order.startedAt,
          completed_at: order.completedAt,
          cancelled_at: order.cancelledAt,
          created_at: order.createdAt,
        })
        .onConflictDoUpdate({
          target: conversionOrders.id,
          set: {
            status: order.status,
            actual_output_quantity: order.actualOutputQuantity,
            output_unit_cost: order.outputUnitCost,
            output_movement_id: order.outputMovementId,
            variance_reason: order.varianceReason,
            notes: order.notes,
            approved_by: order.approvedBy,
            completed_by: order.completedBy,
            cancelled_by: order.cancelledBy,
            approved_at: order.approvedAt,
            started_at: order.startedAt,
            completed_at: order.completedAt,
            cancelled_at: order.cancelledAt,
          },
        });

      for (const line of order.inputLines) {
        await tx
          .insert(conversionOrderInputLines)
          .values({
            id: line.id,
            conversion_order_id: order.id,
            ingredient_item_id: line.ingredientItemId,
            planned_quantity_per_unit: line.plannedQuantityPerUnit,
            planned_quantity: line.plannedQuantity,
            actual_quantity: line.actualQuantity,
            unit_cost: line.unitCost,
            movement_id: line.movementId,
          })
          .onConflictDoUpdate({
            target: conversionOrderInputLines.id,
            set: {
              actual_quantity: line.actualQuantity,
              unit_cost: line.unitCost,
              movement_id: line.movementId,
            },
          });
      }
    });
  }

  async findById(id: string): Promise<ConversionOrder | null> {
    const [row] = await this.db.select().from(conversionOrders).where(eq(conversionOrders.id, id)).limit(1);
    if (!row) return null;
    return this.toDomain(row, await this.loadInputLines(id));
  }

  async list(filter?: { branchId?: string; status?: string }): Promise<ConversionOrder[]> {
    const rows = await this.db
      .select()
      .from(conversionOrders)
      .where(
        and(
          filter?.branchId ? eq(conversionOrders.branch_id, filter.branchId) : undefined,
          filter?.status ? eq(conversionOrders.status, filter.status) : undefined
        )
      )
      .orderBy(desc(conversionOrders.created_at));
    const orders: ConversionOrder[] = [];
    for (const row of rows) orders.push(this.toDomain(row, await this.loadInputLines(row.id)));
    return orders;
  }

  private loadInputLines(conversionOrderId: string): Promise<(typeof conversionOrderInputLines.$inferSelect)[]> {
    return this.db.select().from(conversionOrderInputLines).where(eq(conversionOrderInputLines.conversion_order_id, conversionOrderId));
  }

  private toDomain(
    row: typeof conversionOrders.$inferSelect,
    lineRows: (typeof conversionOrderInputLines.$inferSelect)[]
  ): ConversionOrder {
    return ConversionOrder.reconstitute(row.id, {
      branchId: row.branch_id,
      recipeId: row.recipe_id,
      recipeVersionId: row.recipe_version_id,
      outputItemId: row.output_item_id,
      status: row.status as ConversionOrderStatus,
      plannedOutputQuantity: Number(row.planned_output_quantity),
      actualOutputQuantity: row.actual_output_quantity === null ? null : Number(row.actual_output_quantity),
      outputUnitCost: row.output_unit_cost === null ? null : Number(row.output_unit_cost),
      outputMovementId: row.output_movement_id,
      inputLines: lineRows.map((l) => ({
        id: l.id,
        ingredientItemId: l.ingredient_item_id,
        plannedQuantityPerUnit: Number(l.planned_quantity_per_unit),
        plannedQuantity: Number(l.planned_quantity),
        actualQuantity: l.actual_quantity === null ? null : Number(l.actual_quantity),
        unitCost: l.unit_cost === null ? null : Number(l.unit_cost),
        movementId: l.movement_id,
      })),
      varianceReason: row.variance_reason,
      notes: row.notes,
      createdBy: row.created_by,
      approvedBy: row.approved_by,
      completedBy: row.completed_by,
      cancelledBy: row.cancelled_by,
      approvedAt: row.approved_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      cancelledAt: row.cancelled_at,
      createdAt: row.created_at,
    });
  }
}
