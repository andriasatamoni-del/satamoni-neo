import { Inject, Injectable } from "@nestjs/common";
import { and, asc, count, desc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { branches } from "../../../branches/infrastructure/persistence/branches.tables";
import { inventoryItems } from "../../../inventory/infrastructure/persistence/inventory.tables";
import {
  goodsReceiptItems,
  goodsReceipts,
  purchaseOrderItems,
  purchaseOrders,
  suppliers,
} from "../../../procurement/infrastructure/persistence/procurement.tables";
import type {
  ProcurementReportsReaderPort,
  PurchaseOrderReportRow,
  PurchaseReceiptReportRow,
  PurchasePriceHistoryRow,
  PurchasePriceVarianceRow,
  SupplierPerformanceReport,
  OutstandingPurchaseOrderRow,
} from "../../domain/ports/procurement-reports-reader.port";
import { businessDayStartUtc, businessDayEndUtc } from "../../../../shared/time/business-date";

function dayRange(from: string, to: string): { fromTs: Date; toTs: Date } {
  return { fromTs: businessDayStartUtc(from), toTs: businessDayEndUtc(to) };
}

const PO_TOTAL_VALUE = sql<string>`COALESCE(SUM(${purchaseOrderItems.quantity} * ${purchaseOrderItems.unit_price}), 0)`;

@Injectable()
export class ProcurementReportsReader implements ProcurementReportsReaderPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async getPurchaseOrders(input: {
    branchId: string | null; supplierId?: string | null; status?: string | null; from: string; to: string;
  }): Promise<PurchaseOrderReportRow[]> {
    const { fromTs, toTs } = dayRange(input.from, input.to);
    const rows = await this.db
      .select({
        id: purchaseOrders.id,
        created_at: purchaseOrders.created_at,
        status: purchaseOrders.status,
        supplier_id: purchaseOrders.supplier_id,
        supplier_name: suppliers.name,
        branch_id: purchaseOrders.branch_id,
        branch_name: branches.name,
        items_count: count(purchaseOrderItems.id),
        total_value: PO_TOTAL_VALUE,
      })
      .from(purchaseOrders)
      .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplier_id))
      .innerJoin(branches, eq(branches.id, purchaseOrders.branch_id))
      .leftJoin(purchaseOrderItems, eq(purchaseOrderItems.purchase_order_id, purchaseOrders.id))
      .where(
        and(
          gte(purchaseOrders.created_at, fromTs),
          lte(purchaseOrders.created_at, toTs),
          input.branchId ? eq(purchaseOrders.branch_id, input.branchId) : undefined,
          input.supplierId ? eq(purchaseOrders.supplier_id, input.supplierId) : undefined,
          input.status ? eq(purchaseOrders.status, input.status) : undefined
        )
      )
      .groupBy(purchaseOrders.id, suppliers.name, branches.name)
      .orderBy(desc(purchaseOrders.created_at));

    return rows.map((r) => ({
      id: r.id, createdAt: r.created_at.toISOString(), status: r.status,
      supplierId: r.supplier_id, supplierName: r.supplier_name, branchId: r.branch_id, branchName: r.branch_name,
      itemsCount: Number(r.items_count), totalValue: Number(r.total_value),
    }));
  }

  async getPurchaseReceipts(input: {
    branchId: string | null; supplierId?: string | null; from: string; to: string;
  }): Promise<PurchaseReceiptReportRow[]> {
    const { fromTs, toTs } = dayRange(input.from, input.to);
    const rows = await this.db
      .select({
        id: goodsReceipts.id,
        confirmed_at: goodsReceipts.confirmed_at,
        status: goodsReceipts.status,
        supplier_id: goodsReceipts.supplier_id,
        supplier_name: suppliers.name,
        branch_id: goodsReceipts.branch_id,
        branch_name: branches.name,
        purchase_order_id: goodsReceipts.purchase_order_id,
        total_value: sql<string>`COALESCE(SUM(${goodsReceiptItems.quantity} * ${goodsReceiptItems.unit_cost}), 0)`,
      })
      .from(goodsReceipts)
      .leftJoin(suppliers, eq(suppliers.id, goodsReceipts.supplier_id))
      .innerJoin(branches, eq(branches.id, goodsReceipts.branch_id))
      .leftJoin(goodsReceiptItems, eq(goodsReceiptItems.goods_receipt_id, goodsReceipts.id))
      .where(
        and(
          eq(goodsReceipts.status, "CONFIRMED"),
          gte(goodsReceipts.confirmed_at, fromTs),
          lte(goodsReceipts.confirmed_at, toTs),
          input.branchId ? eq(goodsReceipts.branch_id, input.branchId) : undefined,
          input.supplierId ? eq(goodsReceipts.supplier_id, input.supplierId) : undefined
        )
      )
      .groupBy(goodsReceipts.id, suppliers.name, branches.name)
      .orderBy(desc(goodsReceipts.confirmed_at));

    return rows.map((r) => ({
      id: r.id, confirmedAt: r.confirmed_at ? r.confirmed_at.toISOString() : null, status: r.status,
      supplierId: r.supplier_id, supplierName: r.supplier_name, branchId: r.branch_id, branchName: r.branch_name,
      purchaseOrderId: r.purchase_order_id, totalValue: Number(r.total_value),
    }));
  }

  async getPurchasePriceHistory(input: { inventoryItemId: string; supplierId?: string | null }): Promise<PurchasePriceHistoryRow[]> {
    const rows = await this.db
      .select({
        purchase_order_id: purchaseOrders.id,
        created_at: purchaseOrders.created_at,
        status: purchaseOrders.status,
        supplier_id: purchaseOrders.supplier_id,
        supplier_name: suppliers.name,
        quantity: purchaseOrderItems.quantity,
        unit_price: purchaseOrderItems.unit_price,
      })
      .from(purchaseOrderItems)
      .innerJoin(purchaseOrders, eq(purchaseOrders.id, purchaseOrderItems.purchase_order_id))
      .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplier_id))
      .where(
        and(
          eq(purchaseOrderItems.inventory_item_id, input.inventoryItemId),
          ne(purchaseOrders.status, "CANCELLED"),
          input.supplierId ? eq(purchaseOrders.supplier_id, input.supplierId) : undefined
        )
      )
      .orderBy(desc(purchaseOrders.created_at));

    return rows.map((r) => ({
      purchaseOrderId: r.purchase_order_id, orderDate: r.created_at.toISOString(), status: r.status,
      supplierId: r.supplier_id, supplierName: r.supplier_name, quantity: Number(r.quantity), unitPrice: Number(r.unit_price),
    }));
  }

  async getPurchasePriceVariance(input: { branchId: string | null; from: string; to: string }): Promise<PurchasePriceVarianceRow[]> {
    const { fromTs, toTs } = dayRange(input.from, input.to);
    // بنجيب كل السجل التاريخي (مش بس المدى) عشان "السعر السابق" يتحسب صح حتى لو كان قبل المدى المطلوب
    const rows = await this.db
      .select({
        purchase_order_id: purchaseOrders.id,
        created_at: purchaseOrders.created_at,
        branch_id: purchaseOrders.branch_id,
        supplier_id: purchaseOrders.supplier_id,
        supplier_name: suppliers.name,
        inventory_item_id: purchaseOrderItems.inventory_item_id,
        item_name: inventoryItems.name,
        unit_price: purchaseOrderItems.unit_price,
      })
      .from(purchaseOrderItems)
      .innerJoin(purchaseOrders, eq(purchaseOrders.id, purchaseOrderItems.purchase_order_id))
      .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplier_id))
      .innerJoin(inventoryItems, eq(inventoryItems.id, purchaseOrderItems.inventory_item_id))
      .where(ne(purchaseOrders.status, "CANCELLED"))
      .orderBy(asc(purchaseOrders.created_at), asc(purchaseOrderItems.id));

    const lastPriceBySupplierItem = new Map<string, number>();
    const result: PurchasePriceVarianceRow[] = [];
    for (const r of rows) {
      const key = `${r.supplier_id}:${r.inventory_item_id}`;
      const previousPrice = lastPriceBySupplierItem.get(key) ?? null;
      const newPrice = Number(r.unit_price);
      const inRange = r.created_at >= fromTs && r.created_at <= toTs;
      const branchOk = !input.branchId || r.branch_id === input.branchId;
      if (inRange && branchOk) {
        const difference = previousPrice !== null ? newPrice - previousPrice : null;
        result.push({
          purchaseOrderId: r.purchase_order_id, orderDate: r.created_at.toISOString(),
          supplierId: r.supplier_id, supplierName: r.supplier_name,
          inventoryItemId: r.inventory_item_id, itemName: r.item_name,
          previousPrice, newPrice, difference,
          differencePercent: previousPrice ? ((difference as number) / previousPrice) * 100 : null,
        });
      }
      lastPriceBySupplierItem.set(key, newPrice);
    }
    return result.sort((a, b) => b.orderDate.localeCompare(a.orderDate));
  }

  async getSupplierPerformance(input: { supplierId: string; from: string; to: string }): Promise<SupplierPerformanceReport> {
    const { fromTs, toTs } = dayRange(input.from, input.to);
    const orders = await this.db
      .select({ id: purchaseOrders.id, created_at: purchaseOrders.created_at })
      .from(purchaseOrders)
      .where(
        and(
          eq(purchaseOrders.supplier_id, input.supplierId),
          ne(purchaseOrders.status, "CANCELLED"),
          gte(purchaseOrders.created_at, fromTs),
          lte(purchaseOrders.created_at, toTs)
        )
      );

    const orderIds = orders.map((o) => o.id);
    const receipts =
      orderIds.length > 0
        ? await this.db
            .select({ purchase_order_id: goodsReceipts.purchase_order_id, confirmed_at: goodsReceipts.confirmed_at })
            .from(goodsReceipts)
            .where(and(inArray(goodsReceipts.purchase_order_id, orderIds), eq(goodsReceipts.status, "CONFIRMED")))
        : [];

    const earliestReceiptByPo = new Map<string, Date>();
    for (const r of receipts) {
      if (!r.purchase_order_id || !r.confirmed_at) continue;
      const existing = earliestReceiptByPo.get(r.purchase_order_id);
      if (!existing || r.confirmed_at < existing) earliestReceiptByPo.set(r.purchase_order_id, r.confirmed_at);
    }

    let totalLeadDays = 0;
    let leadCount = 0;
    for (const o of orders) {
      const receiptDate = earliestReceiptByPo.get(o.id);
      if (receiptDate) {
        totalLeadDays += (receiptDate.getTime() - o.created_at.getTime()) / (1000 * 60 * 60 * 24);
        leadCount++;
      }
    }

    return {
      supplierId: input.supplierId, from: input.from, to: input.to,
      ordersCount: orders.length,
      receivedOrdersCount: earliestReceiptByPo.size,
      fulfillmentRate: orders.length > 0 ? (earliestReceiptByPo.size / orders.length) * 100 : null,
      avgLeadTimeDays: leadCount > 0 ? totalLeadDays / leadCount : null,
    };
  }

  async getOutstandingPurchaseOrders(input: { branchId: string | null }): Promise<OutstandingPurchaseOrderRow[]> {
    const rows = await this.db
      .select({
        id: purchaseOrders.id,
        created_at: purchaseOrders.created_at,
        supplier_id: purchaseOrders.supplier_id,
        supplier_name: suppliers.name,
        branch_id: purchaseOrders.branch_id,
        branch_name: branches.name,
        items_count: count(purchaseOrderItems.id),
        total_value: PO_TOTAL_VALUE,
      })
      .from(purchaseOrders)
      .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplier_id))
      .innerJoin(branches, eq(branches.id, purchaseOrders.branch_id))
      .leftJoin(purchaseOrderItems, eq(purchaseOrderItems.purchase_order_id, purchaseOrders.id))
      .where(
        and(
          inArray(purchaseOrders.status, ["SENT", "PARTIALLY_RECEIVED"]),
          input.branchId ? eq(purchaseOrders.branch_id, input.branchId) : undefined
        )
      )
      .groupBy(purchaseOrders.id, suppliers.name, branches.name)
      .orderBy(asc(purchaseOrders.created_at));

    return rows.map((r) => ({
      id: r.id, createdAt: r.created_at.toISOString(), supplierId: r.supplier_id, supplierName: r.supplier_name,
      branchId: r.branch_id, branchName: r.branch_name, itemsCount: Number(r.items_count), totalValue: Number(r.total_value),
    }));
  }
}
