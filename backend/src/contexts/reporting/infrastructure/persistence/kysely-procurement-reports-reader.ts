import { Inject, Injectable } from "@nestjs/common";
import { sql, type Kysely } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import type {
  ProcurementReportsReaderPort,
  PurchaseOrderReportRow,
  PurchaseReceiptReportRow,
  PurchasePriceHistoryRow,
  PurchasePriceVarianceRow,
  SupplierPerformanceReport,
  OutstandingPurchaseOrderRow,
} from "../../domain/ports/procurement-reports-reader.port";

function dayRange(from: string, to: string): { fromTs: Date; toTs: Date } {
  return { fromTs: new Date(`${from}T00:00:00.000`), toTs: new Date(`${to}T23:59:59.999`) };
}

@Injectable()
export class KyselyProcurementReportsReader implements ProcurementReportsReaderPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async getPurchaseOrders(input: {
    branchId: string | null; supplierId?: string | null; status?: string | null; from: string; to: string;
  }): Promise<PurchaseOrderReportRow[]> {
    const { fromTs, toTs } = dayRange(input.from, input.to);
    let query = this.db
      .selectFrom("purchase_orders")
      .innerJoin("suppliers", "suppliers.id", "purchase_orders.supplier_id")
      .innerJoin("branches", "branches.id", "purchase_orders.branch_id")
      .leftJoin("purchase_order_items", "purchase_order_items.purchase_order_id", "purchase_orders.id")
      .select((eb) => [
        "purchase_orders.id as id",
        "purchase_orders.created_at as created_at",
        "purchase_orders.status as status",
        "purchase_orders.supplier_id as supplier_id",
        "suppliers.name as supplier_name",
        "purchase_orders.branch_id as branch_id",
        "branches.name as branch_name",
        eb.fn.count("purchase_order_items.id").as("items_count"),
        eb.fn.coalesce(eb.fn.sum(sql<number>`purchase_order_items.quantity * purchase_order_items.unit_price`), sql<number>`0`).as("total_value"),
      ])
      .where("purchase_orders.created_at", ">=", fromTs)
      .where("purchase_orders.created_at", "<=", toTs)
      .groupBy(["purchase_orders.id", "suppliers.name", "branches.name"])
      .orderBy("purchase_orders.created_at", "desc");
    if (input.branchId) query = query.where("purchase_orders.branch_id", "=", input.branchId);
    if (input.supplierId) query = query.where("purchase_orders.supplier_id", "=", input.supplierId);
    if (input.status) query = query.where("purchase_orders.status", "=", input.status);
    const rows = await query.execute();

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
    let query = this.db
      .selectFrom("goods_receipts")
      .leftJoin("suppliers", "suppliers.id", "goods_receipts.supplier_id")
      .innerJoin("branches", "branches.id", "goods_receipts.branch_id")
      .leftJoin("goods_receipt_items", "goods_receipt_items.goods_receipt_id", "goods_receipts.id")
      .select((eb) => [
        "goods_receipts.id as id",
        "goods_receipts.confirmed_at as confirmed_at",
        "goods_receipts.status as status",
        "goods_receipts.supplier_id as supplier_id",
        "suppliers.name as supplier_name",
        "goods_receipts.branch_id as branch_id",
        "branches.name as branch_name",
        "goods_receipts.purchase_order_id as purchase_order_id",
        eb.fn.coalesce(eb.fn.sum(sql<number>`goods_receipt_items.quantity * goods_receipt_items.unit_cost`), sql<number>`0`).as("total_value"),
      ])
      .where("goods_receipts.status", "=", "CONFIRMED")
      .where("goods_receipts.confirmed_at", ">=", fromTs)
      .where("goods_receipts.confirmed_at", "<=", toTs)
      .groupBy(["goods_receipts.id", "suppliers.name", "branches.name"])
      .orderBy("goods_receipts.confirmed_at", "desc");
    if (input.branchId) query = query.where("goods_receipts.branch_id", "=", input.branchId);
    if (input.supplierId) query = query.where("goods_receipts.supplier_id", "=", input.supplierId);
    const rows = await query.execute();

    return rows.map((r) => ({
      id: r.id, confirmedAt: r.confirmed_at ? r.confirmed_at.toISOString() : null, status: r.status,
      supplierId: r.supplier_id, supplierName: r.supplier_name, branchId: r.branch_id, branchName: r.branch_name,
      purchaseOrderId: r.purchase_order_id, totalValue: Number(r.total_value),
    }));
  }

  async getPurchasePriceHistory(input: { inventoryItemId: string; supplierId?: string | null }): Promise<PurchasePriceHistoryRow[]> {
    let query = this.db
      .selectFrom("purchase_order_items")
      .innerJoin("purchase_orders", "purchase_orders.id", "purchase_order_items.purchase_order_id")
      .innerJoin("suppliers", "suppliers.id", "purchase_orders.supplier_id")
      .select([
        "purchase_orders.id as purchase_order_id",
        "purchase_orders.created_at as created_at",
        "purchase_orders.status as status",
        "purchase_orders.supplier_id as supplier_id",
        "suppliers.name as supplier_name",
        "purchase_order_items.quantity as quantity",
        "purchase_order_items.unit_price as unit_price",
      ])
      .where("purchase_order_items.inventory_item_id", "=", input.inventoryItemId)
      .where("purchase_orders.status", "<>", "CANCELLED")
      .orderBy("purchase_orders.created_at", "desc");
    if (input.supplierId) query = query.where("purchase_orders.supplier_id", "=", input.supplierId);
    const rows = await query.execute();

    return rows.map((r) => ({
      purchaseOrderId: r.purchase_order_id, orderDate: r.created_at.toISOString(), status: r.status,
      supplierId: r.supplier_id, supplierName: r.supplier_name, quantity: Number(r.quantity), unitPrice: Number(r.unit_price),
    }));
  }

  async getPurchasePriceVariance(input: { branchId: string | null; from: string; to: string }): Promise<PurchasePriceVarianceRow[]> {
    const { fromTs, toTs } = dayRange(input.from, input.to);
    // بنجيب كل السجل التاريخي (مش بس المدى) عشان "السعر السابق" يتحسب صح حتى لو كان قبل المدى المطلوب
    const rows = await this.db
      .selectFrom("purchase_order_items")
      .innerJoin("purchase_orders", "purchase_orders.id", "purchase_order_items.purchase_order_id")
      .innerJoin("suppliers", "suppliers.id", "purchase_orders.supplier_id")
      .innerJoin("inventory_items", "inventory_items.id", "purchase_order_items.inventory_item_id")
      .select([
        "purchase_orders.id as purchase_order_id",
        "purchase_orders.created_at as created_at",
        "purchase_orders.branch_id as branch_id",
        "purchase_orders.supplier_id as supplier_id",
        "suppliers.name as supplier_name",
        "purchase_order_items.inventory_item_id as inventory_item_id",
        "inventory_items.name as item_name",
        "purchase_order_items.unit_price as unit_price",
      ])
      .where("purchase_orders.status", "<>", "CANCELLED")
      .orderBy("purchase_orders.created_at", "asc")
      .orderBy("purchase_order_items.id", "asc")
      .execute();

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
      .selectFrom("purchase_orders")
      .select(["id", "created_at"])
      .where("supplier_id", "=", input.supplierId)
      .where("status", "<>", "CANCELLED")
      .where("created_at", ">=", fromTs)
      .where("created_at", "<=", toTs)
      .execute();

    const orderIds = orders.map((o) => o.id);
    const receipts = orderIds.length > 0
      ? await this.db
          .selectFrom("goods_receipts")
          .select(["purchase_order_id", "confirmed_at"])
          .where("purchase_order_id", "in", orderIds)
          .where("status", "=", "CONFIRMED")
          .execute()
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
    let query = this.db
      .selectFrom("purchase_orders")
      .innerJoin("suppliers", "suppliers.id", "purchase_orders.supplier_id")
      .innerJoin("branches", "branches.id", "purchase_orders.branch_id")
      .leftJoin("purchase_order_items", "purchase_order_items.purchase_order_id", "purchase_orders.id")
      .select((eb) => [
        "purchase_orders.id as id",
        "purchase_orders.created_at as created_at",
        "purchase_orders.supplier_id as supplier_id",
        "suppliers.name as supplier_name",
        "purchase_orders.branch_id as branch_id",
        "branches.name as branch_name",
        eb.fn.count("purchase_order_items.id").as("items_count"),
        eb.fn.coalesce(eb.fn.sum(sql<number>`purchase_order_items.quantity * purchase_order_items.unit_price`), sql<number>`0`).as("total_value"),
      ])
      .where("purchase_orders.status", "in", ["SENT", "PARTIALLY_RECEIVED"])
      .groupBy(["purchase_orders.id", "suppliers.name", "branches.name"])
      .orderBy("purchase_orders.created_at", "asc");
    if (input.branchId) query = query.where("purchase_orders.branch_id", "=", input.branchId);
    const rows = await query.execute();

    return rows.map((r) => ({
      id: r.id, createdAt: r.created_at.toISOString(), supplierId: r.supplier_id, supplierName: r.supplier_name,
      branchId: r.branch_id, branchName: r.branch_name, itemsCount: Number(r.items_count), totalValue: Number(r.total_value),
    }));
  }
}
