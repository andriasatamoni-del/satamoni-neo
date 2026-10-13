import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, inArray, isNotNull, lt, or, sql } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import type {
  RequisitionSuggestionReaderPort,
  ThresholdItemRow,
} from "../../domain/ports/requisition-suggestion-reader.port";
import {
  branchStockBalances,
  branchStockThresholds,
  inventoryItems,
  stockMovements,
  transferRequestLines,
  transferRequests,
} from "./inventory.tables";

// الاستهلاك بيتحسب بتاريخ القاهرة (مش UTC) - طلب الساعة 1 بالليل بتوقيت القاهرة تبع يوم العمل ده، مش
// اليوم اللي قبله. نفس مبدأ getCairoBusinessDate في الريبو القديم. ثابت مكتوب inline (مش bind parameter)
// لأن نفس التعبير موجود في SELECT وGROUP BY، وPostgres بيعتبر $1 و$4 تعبيرين مختلفين حتى لو نفس القيمة
const BUSINESS_DATE_EXPR = sql`(${stockMovements.occurred_at} AT TIME ZONE 'Africa/Cairo')::date`;

@Injectable()
export class RequisitionSuggestionReader implements RequisitionSuggestionReaderPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listThresholdItems(branchId: string): Promise<ThresholdItemRow[]> {
    const rows = await this.db
      .select({
        inventory_item_id: branchStockThresholds.inventory_item_id,
        name: inventoryItems.name,
        unit: inventoryItems.unit,
        quantity: branchStockBalances.quantity,
        min_stock: branchStockThresholds.min_stock,
        max_stock: branchStockThresholds.max_stock,
      })
      .from(branchStockThresholds)
      .innerJoin(inventoryItems, eq(inventoryItems.id, branchStockThresholds.inventory_item_id))
      .leftJoin(
        branchStockBalances,
        and(
          eq(branchStockBalances.branch_id, branchStockThresholds.branch_id),
          eq(branchStockBalances.inventory_item_id, branchStockThresholds.inventory_item_id)
        )
      )
      .where(
        and(
          eq(branchStockThresholds.branch_id, branchId),
          or(
            isNotNull(branchStockThresholds.reorder_point),
            isNotNull(branchStockThresholds.min_stock),
            isNotNull(branchStockThresholds.max_stock)
          )
        )
      )
      .orderBy(asc(inventoryItems.name));

    return rows.map((r) => ({
      inventoryItemId: r.inventory_item_id,
      name: r.name,
      unit: r.unit,
      currentStock: r.quantity != null ? Number(r.quantity) : 0,
      minStock: r.min_stock != null ? Number(r.min_stock) : null,
      maxStock: r.max_stock != null ? Number(r.max_stock) : null,
    }));
  }

  async consumptionByDate(
    branchId: string,
    dates: string[],
    movementTypes: readonly string[]
  ): Promise<Map<string, Map<string, number>>> {
    const result = new Map<string, Map<string, number>>();
    if (dates.length === 0) return result;

    const rows = await this.db
      .select({
        inventory_item_id: stockMovements.inventory_item_id,
        business_date: sql<string>`to_char(${BUSINESS_DATE_EXPR}, 'YYYY-MM-DD')`,
        consumed: sql<number>`SUM(-${stockMovements.quantity_delta})`,
      })
      .from(stockMovements)
      .where(
        and(
          eq(stockMovements.branch_id, branchId),
          lt(stockMovements.quantity_delta, 0),
          inArray(stockMovements.movement_type, [...movementTypes]),
          sql`${BUSINESS_DATE_EXPR} = ANY(${sql.param(dates)}::date[])`
        )
      )
      .groupBy(stockMovements.inventory_item_id, BUSINESS_DATE_EXPR);

    for (const row of rows) {
      const byDate = result.get(row.inventory_item_id) ?? new Map<string, number>();
      byDate.set(row.business_date, Number(row.consumed));
      result.set(row.inventory_item_id, byDate);
    }
    return result;
  }

  async pendingPipelineQuantities(branchId: string): Promise<Map<string, number>> {
    const rows = await this.db
      .select({
        inventory_item_id: transferRequestLines.inventory_item_id,
        quantity: sql<number>`SUM(COALESCE(${transferRequestLines.approved_quantity}, ${transferRequestLines.requested_quantity}))`,
      })
      .from(transferRequestLines)
      .innerJoin(transferRequests, eq(transferRequests.id, transferRequestLines.transfer_request_id))
      .where(and(eq(transferRequests.to_branch_id, branchId), inArray(transferRequests.status, ["SUBMITTED", "APPROVED"])))
      .groupBy(transferRequestLines.inventory_item_id);
    return new Map(rows.map((r) => [r.inventory_item_id, Number(r.quantity)]));
  }

  async inTransitQuantities(branchId: string): Promise<Map<string, number>> {
    const rows = await this.db
      .select({
        inventory_item_id: transferRequestLines.inventory_item_id,
        quantity: sql<number>`SUM(COALESCE(${transferRequestLines.dispatched_quantity}, 0))`,
      })
      .from(transferRequestLines)
      .innerJoin(transferRequests, eq(transferRequests.id, transferRequestLines.transfer_request_id))
      .where(and(eq(transferRequests.to_branch_id, branchId), eq(transferRequests.status, "DISPATCHED")))
      .groupBy(transferRequestLines.inventory_item_id);
    return new Map(rows.map((r) => [r.inventory_item_id, Number(r.quantity)]));
  }
}
