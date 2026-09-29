import { Inject, Injectable } from "@nestjs/common";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import type {
  RequisitionSuggestionReaderPort,
  ThresholdItemRow,
} from "../../domain/ports/requisition-suggestion-reader.port";

// الاستهلاك بيتحسب بتاريخ القاهرة (مش UTC) - طلب الساعة 1 بالليل بتوقيت القاهرة تبع يوم العمل ده، مش
// اليوم اللي قبله. نفس مبدأ getCairoBusinessDate في الريبو القديم. ثابت مكتوب inline (مش bind parameter)
// لأن نفس التعبير موجود في SELECT وGROUP BY، وPostgres بيعتبر $1 و$4 تعبيرين مختلفين حتى لو نفس القيمة
const BUSINESS_DATE_EXPR = sql.raw("(stock_movements.occurred_at AT TIME ZONE 'Africa/Cairo')::date");

@Injectable()
export class KyselyRequisitionSuggestionReader implements RequisitionSuggestionReaderPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async listThresholdItems(branchId: string): Promise<ThresholdItemRow[]> {
    const rows = await this.db
      .selectFrom("branch_stock_thresholds as t")
      .innerJoin("inventory_items as i", "i.id", "t.inventory_item_id")
      .leftJoin("branch_stock_balances as b", (join) =>
        join.onRef("b.branch_id", "=", "t.branch_id").onRef("b.inventory_item_id", "=", "t.inventory_item_id")
      )
      .select([
        "t.inventory_item_id as inventory_item_id",
        "i.name as name",
        "i.unit as unit",
        "b.quantity as quantity",
        "t.min_stock as min_stock",
        "t.max_stock as max_stock",
      ])
      .where("t.branch_id", "=", branchId)
      .where((eb) =>
        eb.or([eb("t.reorder_point", "is not", null), eb("t.min_stock", "is not", null), eb("t.max_stock", "is not", null)])
      )
      .orderBy("i.name")
      .execute();

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

    const businessDate = sql<string>`to_char(${BUSINESS_DATE_EXPR}, 'YYYY-MM-DD')`;
    const rows = await this.db
      .selectFrom("stock_movements")
      .select([
        "stock_movements.inventory_item_id as inventory_item_id",
        businessDate.as("business_date"),
        sql<number>`SUM(-stock_movements.quantity_delta)`.as("consumed"),
      ])
      .where("stock_movements.branch_id", "=", branchId)
      .where("stock_movements.quantity_delta", "<", 0)
      .where("stock_movements.movement_type", "in", [...movementTypes])
      .where(sql<boolean>`${BUSINESS_DATE_EXPR} = ANY(${dates}::date[])`)
      .groupBy(["stock_movements.inventory_item_id", sql`${BUSINESS_DATE_EXPR}`])
      .execute();

    for (const row of rows) {
      const byDate = result.get(row.inventory_item_id) ?? new Map<string, number>();
      byDate.set(row.business_date, Number(row.consumed));
      result.set(row.inventory_item_id, byDate);
    }
    return result;
  }

  async pendingPipelineQuantities(branchId: string): Promise<Map<string, number>> {
    const rows = await this.db
      .selectFrom("transfer_request_lines as l")
      .innerJoin("transfer_requests as r", "r.id", "l.transfer_request_id")
      .select([
        "l.inventory_item_id as inventory_item_id",
        sql<number>`SUM(COALESCE(l.approved_quantity, l.requested_quantity))`.as("quantity"),
      ])
      .where("r.to_branch_id", "=", branchId)
      .where("r.status", "in", ["SUBMITTED", "APPROVED"])
      .groupBy("l.inventory_item_id")
      .execute();
    return new Map(rows.map((r) => [r.inventory_item_id, Number(r.quantity)]));
  }

  async inTransitQuantities(branchId: string): Promise<Map<string, number>> {
    const rows = await this.db
      .selectFrom("transfer_request_lines as l")
      .innerJoin("transfer_requests as r", "r.id", "l.transfer_request_id")
      .select([
        "l.inventory_item_id as inventory_item_id",
        sql<number>`SUM(COALESCE(l.dispatched_quantity, 0))`.as("quantity"),
      ])
      .where("r.to_branch_id", "=", branchId)
      .where("r.status", "=", "DISPATCHED")
      .groupBy("l.inventory_item_id")
      .execute();
    return new Map(rows.map((r) => [r.inventory_item_id, Number(r.quantity)]));
  }
}
