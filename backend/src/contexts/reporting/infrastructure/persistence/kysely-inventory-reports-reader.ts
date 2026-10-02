import { Inject, Injectable } from "@nestjs/common";
import type { Kysely } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { sql } from "kysely";
import type {
  InventoryReportsReaderPort,
  InventoryValuationReport,
  StockCardRow,
  TransferReportRow,
  NegativeStockRow,
  InventoryComparisonRow,
  ExpiringBatchRow,
} from "../../domain/ports/inventory-reports-reader.port";
import { businessDayStartUtc, businessDayEndUtc } from "../../../../shared/time/business-date";

@Injectable()
export class KyselyInventoryReportsReader implements InventoryReportsReaderPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async getValuation(input: { branchId: string | null }): Promise<InventoryValuationReport> {
    let query = this.db
      .selectFrom("branch_stock_balances")
      .innerJoin("branches", "branches.id", "branch_stock_balances.branch_id")
      .innerJoin("inventory_items", "inventory_items.id", "branch_stock_balances.inventory_item_id")
      .select([
        "branch_stock_balances.branch_id as branch_id",
        "branches.name as branch_name",
        "inventory_items.id as inventory_item_id",
        "inventory_items.name as item_name",
        "inventory_items.unit as unit",
        "branch_stock_balances.quantity as quantity",
        "inventory_items.unit_cost as unit_cost",
      ])
      .where("branch_stock_balances.quantity", "<>", 0);
    if (input.branchId) query = query.where("branch_stock_balances.branch_id", "=", input.branchId);
    const rows = await query.execute();

    const items = rows
      .map((r) => {
        const unitCost = r.unit_cost != null ? Number(r.unit_cost) : null;
        const quantity = Number(r.quantity);
        return {
          branchId: r.branch_id,
          branchName: r.branch_name,
          inventoryItemId: r.inventory_item_id,
          itemName: r.item_name,
          unit: r.unit,
          quantity,
          unitCost,
          value: unitCost !== null ? quantity * unitCost : 0,
          costIncomplete: unitCost === null,
        };
      })
      .sort((a, b) => b.value - a.value);

    const byBranchMap = new Map<string, { branchId: string; branchName: string; totalValue: number }>();
    for (const i of items) {
      const entry = byBranchMap.get(i.branchId) ?? { branchId: i.branchId, branchName: i.branchName, totalValue: 0 };
      entry.totalValue += i.value;
      byBranchMap.set(i.branchId, entry);
    }

    return {
      branchId: input.branchId,
      totalValue: items.reduce((s, i) => s + i.value, 0),
      byBranch: [...byBranchMap.values()].sort((a, b) => b.totalValue - a.totalValue),
      items,
    };
  }

  async getStockCard(input: { branchId: string; inventoryItemId: string; from?: string; to?: string }): Promise<StockCardRow[]> {
    let openingBalance = 0;
    if (input.from) {
      const openingRows = await this.db
        .selectFrom("stock_movements")
        .select("quantity_delta")
        .where("branch_id", "=", input.branchId)
        .where("inventory_item_id", "=", input.inventoryItemId)
        .where("occurred_at", "<", businessDayStartUtc(input.from))
        .execute();
      openingBalance = openingRows.reduce((s, r) => s + Number(r.quantity_delta), 0);
    }

    let query = this.db
      .selectFrom("stock_movements")
      .select(["id", "movement_type", "quantity_delta", "unit_cost", "total_cost", "reference_type", "reference_id", "reason", "performed_by", "occurred_at"])
      .where("branch_id", "=", input.branchId)
      .where("inventory_item_id", "=", input.inventoryItemId)
      .orderBy("occurred_at", "asc")
      .orderBy("id", "asc");
    if (input.from) query = query.where("occurred_at", ">=", businessDayStartUtc(input.from));
    if (input.to) query = query.where("occurred_at", "<=", businessDayEndUtc(input.to));
    const rows = await query.execute();

    let running = openingBalance;
    return rows.map((r) => {
      running += Number(r.quantity_delta);
      return {
        id: r.id,
        movementType: r.movement_type,
        quantityDelta: Number(r.quantity_delta),
        unitCost: r.unit_cost != null ? Number(r.unit_cost) : null,
        totalCost: r.total_cost != null ? Number(r.total_cost) : null,
        balanceAfter: running,
        referenceType: r.reference_type,
        referenceId: r.reference_id,
        reason: r.reason,
        performedBy: r.performed_by,
        occurredAt: r.occurred_at.toISOString(),
      };
    });
  }

  async getTransfers(input: { branchId: string | null; from: string; to: string }): Promise<TransferReportRow[]> {
    const fromTs = businessDayStartUtc(input.from);
    const toTs = businessDayEndUtc(input.to);

    let query = this.db
      .selectFrom("transfer_requests")
      .leftJoin("branches as from_b", "from_b.id", "transfer_requests.from_branch_id")
      .innerJoin("branches as to_b", "to_b.id", "transfer_requests.to_branch_id")
      .select([
        "transfer_requests.id as id",
        "transfer_requests.from_branch_id as from_branch_id",
        "from_b.name as from_branch_name",
        "transfer_requests.to_branch_id as to_branch_id",
        "to_b.name as to_branch_name",
        "transfer_requests.status as status",
        "transfer_requests.created_at as created_at",
        "transfer_requests.dispatched_at as dispatched_at",
        "transfer_requests.received_at as received_at",
      ])
      .where("transfer_requests.created_at", ">=", fromTs)
      .where("transfer_requests.created_at", "<=", toTs)
      .orderBy("transfer_requests.created_at", "desc");
    if (input.branchId) {
      query = query.where((eb) => eb.or([eb("transfer_requests.from_branch_id", "=", input.branchId!), eb("transfer_requests.to_branch_id", "=", input.branchId!)]));
    }
    const transfers = await query.execute();

    const ids = transfers.map((t) => t.id);
    const lines = ids.length > 0
      ? await this.db
          .selectFrom("transfer_request_lines")
          .innerJoin("inventory_items", "inventory_items.id", "transfer_request_lines.inventory_item_id")
          .select([
            "transfer_request_lines.transfer_request_id as transfer_request_id",
            "transfer_request_lines.inventory_item_id as inventory_item_id",
            "inventory_items.name as item_name",
            "inventory_items.unit as unit",
            "transfer_request_lines.requested_quantity as requested_quantity",
            "transfer_request_lines.dispatched_quantity as dispatched_quantity",
            "transfer_request_lines.received_quantity as received_quantity",
          ])
          .where("transfer_request_lines.transfer_request_id", "in", ids)
          .execute()
      : [];

    return transfers.map((t) => ({
      id: t.id,
      fromBranchId: t.from_branch_id,
      fromBranchName: t.from_branch_name,
      toBranchId: t.to_branch_id,
      toBranchName: t.to_branch_name,
      status: t.status,
      createdAt: t.created_at.toISOString(),
      dispatchedAt: t.dispatched_at ? t.dispatched_at.toISOString() : null,
      receivedAt: t.received_at ? t.received_at.toISOString() : null,
      lines: lines
        .filter((l) => l.transfer_request_id === t.id)
        .map((l) => ({
          inventoryItemId: l.inventory_item_id,
          itemName: l.item_name,
          unit: l.unit,
          requestedQuantity: Number(l.requested_quantity),
          dispatchedQuantity: l.dispatched_quantity != null ? Number(l.dispatched_quantity) : null,
          receivedQuantity: l.received_quantity != null ? Number(l.received_quantity) : null,
          variance: l.dispatched_quantity != null && l.received_quantity != null ? Number(l.dispatched_quantity) - Number(l.received_quantity) : null,
        })),
    }));
  }

  async getNegativeStock(input: { branchId: string | null }): Promise<NegativeStockRow[]> {
    let query = this.db
      .selectFrom("branch_stock_balances")
      .innerJoin("branches", "branches.id", "branch_stock_balances.branch_id")
      .innerJoin("inventory_items", "inventory_items.id", "branch_stock_balances.inventory_item_id")
      .select([
        "branch_stock_balances.branch_id as branch_id",
        "branches.name as branch_name",
        "inventory_items.id as inventory_item_id",
        "inventory_items.name as item_name",
        "inventory_items.unit as unit",
        "branch_stock_balances.quantity as quantity",
        "inventory_items.negative_stock_policy as negative_stock_policy",
      ])
      .where("branch_stock_balances.quantity", "<", 0)
      .orderBy("branch_stock_balances.quantity", "asc");
    if (input.branchId) query = query.where("branch_stock_balances.branch_id", "=", input.branchId);
    const rows = await query.execute();

    return rows.map((r) => ({
      branchId: r.branch_id,
      branchName: r.branch_name,
      inventoryItemId: r.inventory_item_id,
      itemName: r.item_name,
      unit: r.unit,
      quantity: Number(r.quantity),
      negativeStockPolicy: r.negative_stock_policy,
    }));
  }

  async getInventoryComparison(input: { inventoryItemId: string | null }): Promise<InventoryComparisonRow[]> {
    let itemQuery = this.db.selectFrom("inventory_items").select(["id", "name", "unit"]).orderBy("name");
    if (input.inventoryItemId) itemQuery = itemQuery.where("id", "=", input.inventoryItemId);
    const items = await itemQuery.execute();

    const branches = await this.db.selectFrom("branches").select(["id", "name"]).where("is_central_kitchen", "=", false).orderBy("name").execute();

    const balances = await this.db.selectFrom("branch_stock_balances").select(["branch_id", "inventory_item_id", "quantity"]).execute();
    const balanceMap = new Map(balances.map((b) => [`${b.branch_id}:${b.inventory_item_id}`, Number(b.quantity)]));

    const result: InventoryComparisonRow[] = [];
    for (const item of items) {
      for (const branch of branches) {
        result.push({
          branchId: branch.id,
          branchName: branch.name,
          inventoryItemId: item.id,
          itemName: item.name,
          unit: item.unit,
          quantity: balanceMap.get(`${branch.id}:${item.id}`) ?? 0,
        });
      }
    }
    return result;
  }

  async getExpiringBatches(input: { days: number; branchId: string | null }): Promise<ExpiringBatchRow[]> {
    let query = this.db
      .selectFrom("inventory_batches")
      .innerJoin("inventory_items", "inventory_items.id", "inventory_batches.inventory_item_id")
      .innerJoin("branches", "branches.id", "inventory_batches.branch_id")
      .select([
        "inventory_batches.id as id",
        "inventory_batches.batch_number as batch_number",
        "inventory_batches.inventory_item_id as inventory_item_id",
        "inventory_items.name as item_name",
        "inventory_items.unit as unit",
        "inventory_batches.branch_id as branch_id",
        "branches.name as branch_name",
        "inventory_batches.remaining_quantity as remaining_quantity",
        "inventory_batches.expiry_date as expiry_date",
      ])
      .where("inventory_batches.status", "=", "active")
      .where("inventory_batches.remaining_quantity", ">", 0)
      .where("inventory_batches.expiry_date", "is not", null)
      .where("inventory_batches.expiry_date", "<=", sql<Date>`((now() AT TIME ZONE 'Africa/Cairo')::date + (${input.days} || ' days')::interval)`);
    if (input.branchId) query = query.where("inventory_batches.branch_id", "=", input.branchId);
    const rows = await query.orderBy("inventory_batches.expiry_date", "asc").execute();

    return rows.map((r) => ({
      id: r.id,
      batchNumber: r.batch_number,
      inventoryItemId: r.inventory_item_id,
      itemName: r.item_name,
      unit: r.unit,
      branchId: r.branch_id,
      branchName: r.branch_name,
      remainingQuantity: Number(r.remaining_quantity),
      expiryDate: r.expiry_date!.toISOString().slice(0, 10),
    }));
  }
}
