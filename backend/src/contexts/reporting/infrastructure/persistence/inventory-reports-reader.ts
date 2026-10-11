import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, gt, gte, inArray, isNotNull, lt, lte, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { branches } from "../../../branches/infrastructure/persistence/branches.tables";
import {
  branchStockBalances,
  inventoryBatches,
  inventoryItems,
  stockMovements,
  transferRequestLines,
  transferRequests,
} from "../../../inventory/infrastructure/persistence/inventory.tables";
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

const fromBranch = alias(branches, "from_b");
const toBranch = alias(branches, "to_b");

@Injectable()
export class InventoryReportsReader implements InventoryReportsReaderPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async getValuation(input: { branchId: string | null }): Promise<InventoryValuationReport> {
    const rows = await this.db
      .select({
        branch_id: branchStockBalances.branch_id,
        branch_name: branches.name,
        inventory_item_id: inventoryItems.id,
        item_name: inventoryItems.name,
        unit: inventoryItems.unit,
        quantity: branchStockBalances.quantity,
        unit_cost: inventoryItems.unit_cost,
      })
      .from(branchStockBalances)
      .innerJoin(branches, eq(branches.id, branchStockBalances.branch_id))
      .innerJoin(inventoryItems, eq(inventoryItems.id, branchStockBalances.inventory_item_id))
      .where(and(ne(branchStockBalances.quantity, 0), input.branchId ? eq(branchStockBalances.branch_id, input.branchId) : undefined));

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
    const itemFilter = and(eq(stockMovements.branch_id, input.branchId), eq(stockMovements.inventory_item_id, input.inventoryItemId));
    let openingBalance = 0;
    if (input.from) {
      const openingRows = await this.db
        .select({ quantity_delta: stockMovements.quantity_delta })
        .from(stockMovements)
        .where(and(itemFilter, lt(stockMovements.occurred_at, businessDayStartUtc(input.from))));
      openingBalance = openingRows.reduce((s, r) => s + Number(r.quantity_delta), 0);
    }

    const rows = await this.db
      .select({
        id: stockMovements.id,
        movement_type: stockMovements.movement_type,
        quantity_delta: stockMovements.quantity_delta,
        unit_cost: stockMovements.unit_cost,
        total_cost: stockMovements.total_cost,
        reference_type: stockMovements.reference_type,
        reference_id: stockMovements.reference_id,
        reason: stockMovements.reason,
        performed_by: stockMovements.performed_by,
        occurred_at: stockMovements.occurred_at,
      })
      .from(stockMovements)
      .where(
        and(
          itemFilter,
          input.from ? gte(stockMovements.occurred_at, businessDayStartUtc(input.from)) : undefined,
          input.to ? lte(stockMovements.occurred_at, businessDayEndUtc(input.to)) : undefined
        )
      )
      .orderBy(asc(stockMovements.occurred_at), asc(stockMovements.id));

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

    const transfers = await this.db
      .select({
        id: transferRequests.id,
        from_branch_id: transferRequests.from_branch_id,
        from_branch_name: fromBranch.name,
        to_branch_id: transferRequests.to_branch_id,
        to_branch_name: toBranch.name,
        status: transferRequests.status,
        created_at: transferRequests.created_at,
        dispatched_at: transferRequests.dispatched_at,
        received_at: transferRequests.received_at,
      })
      .from(transferRequests)
      .leftJoin(fromBranch, eq(fromBranch.id, transferRequests.from_branch_id))
      .innerJoin(toBranch, eq(toBranch.id, transferRequests.to_branch_id))
      .where(
        and(
          gte(transferRequests.created_at, fromTs),
          lte(transferRequests.created_at, toTs),
          input.branchId
            ? or(eq(transferRequests.from_branch_id, input.branchId), eq(transferRequests.to_branch_id, input.branchId))
            : undefined
        )
      )
      .orderBy(desc(transferRequests.created_at));

    const ids = transfers.map((t) => t.id);
    const lines =
      ids.length > 0
        ? await this.db
            .select({
              transfer_request_id: transferRequestLines.transfer_request_id,
              inventory_item_id: transferRequestLines.inventory_item_id,
              item_name: inventoryItems.name,
              unit: inventoryItems.unit,
              requested_quantity: transferRequestLines.requested_quantity,
              dispatched_quantity: transferRequestLines.dispatched_quantity,
              received_quantity: transferRequestLines.received_quantity,
            })
            .from(transferRequestLines)
            .innerJoin(inventoryItems, eq(inventoryItems.id, transferRequestLines.inventory_item_id))
            .where(inArray(transferRequestLines.transfer_request_id, ids))
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
          variance:
            l.dispatched_quantity != null && l.received_quantity != null ? Number(l.dispatched_quantity) - Number(l.received_quantity) : null,
        })),
    }));
  }

  async getNegativeStock(input: { branchId: string | null }): Promise<NegativeStockRow[]> {
    const rows = await this.db
      .select({
        branch_id: branchStockBalances.branch_id,
        branch_name: branches.name,
        inventory_item_id: inventoryItems.id,
        item_name: inventoryItems.name,
        unit: inventoryItems.unit,
        quantity: branchStockBalances.quantity,
        negative_stock_policy: inventoryItems.negative_stock_policy,
      })
      .from(branchStockBalances)
      .innerJoin(branches, eq(branches.id, branchStockBalances.branch_id))
      .innerJoin(inventoryItems, eq(inventoryItems.id, branchStockBalances.inventory_item_id))
      .where(and(lt(branchStockBalances.quantity, 0), input.branchId ? eq(branchStockBalances.branch_id, input.branchId) : undefined))
      .orderBy(asc(branchStockBalances.quantity));

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
    const items = await this.db
      .select({ id: inventoryItems.id, name: inventoryItems.name, unit: inventoryItems.unit })
      .from(inventoryItems)
      .where(input.inventoryItemId ? eq(inventoryItems.id, input.inventoryItemId) : undefined)
      .orderBy(asc(inventoryItems.name));

    const branchRows = await this.db
      .select({ id: branches.id, name: branches.name })
      .from(branches)
      .where(eq(branches.is_central_kitchen, false))
      .orderBy(asc(branches.name));

    const balances = await this.db
      .select({
        branch_id: branchStockBalances.branch_id,
        inventory_item_id: branchStockBalances.inventory_item_id,
        quantity: branchStockBalances.quantity,
      })
      .from(branchStockBalances);
    const balanceMap = new Map(balances.map((b) => [`${b.branch_id}:${b.inventory_item_id}`, Number(b.quantity)]));

    const result: InventoryComparisonRow[] = [];
    for (const item of items) {
      for (const branch of branchRows) {
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
    const rows = await this.db
      .select({
        id: inventoryBatches.id,
        batch_number: inventoryBatches.batch_number,
        inventory_item_id: inventoryBatches.inventory_item_id,
        item_name: inventoryItems.name,
        unit: inventoryItems.unit,
        branch_id: inventoryBatches.branch_id,
        branch_name: branches.name,
        remaining_quantity: inventoryBatches.remaining_quantity,
        expiry_date: inventoryBatches.expiry_date,
      })
      .from(inventoryBatches)
      .innerJoin(inventoryItems, eq(inventoryItems.id, inventoryBatches.inventory_item_id))
      .innerJoin(branches, eq(branches.id, inventoryBatches.branch_id))
      .where(
        and(
          eq(inventoryBatches.status, "active"),
          gt(inventoryBatches.remaining_quantity, 0),
          isNotNull(inventoryBatches.expiry_date),
          lte(inventoryBatches.expiry_date, sql`((now() AT TIME ZONE 'Africa/Cairo')::date + (${input.days} || ' days')::interval)`),
          input.branchId ? eq(inventoryBatches.branch_id, input.branchId) : undefined
        )
      )
      .orderBy(asc(inventoryBatches.expiry_date));

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
