import { Inject, Injectable } from "@nestjs/common";
import { and, asc, count, desc, eq, gte, inArray, isNotNull, lte, ne, sql, sum, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { branches } from "../../../branches/infrastructure/persistence/branches.tables";
import {
  combos,
  menuCategories,
  menuItems,
  menuItemVariants,
  recipeIngredients,
  recipes,
  recipeVersions,
} from "../../../catalog/infrastructure/persistence/catalog.tables";
import { inventoryItems } from "../../../inventory/infrastructure/persistence/inventory.tables";
import { orderItems, orders } from "../../../orders/infrastructure/persistence/orders.tables";
import { paymentMethods } from "../../../payment-control/infrastructure/persistence/payment-control.tables";
import type {
  SalesOpsReaderPort,
  DailyBranchSummaryRow,
  SalesDetailReport,
  CancelledOrdersReport,
  DelaysReport,
  ItemPerformanceReport,
  ItemPerformanceRow,
  CatalogReport,
  RecipeReportRow,
} from "../../domain/ports/sales-ops-reader.port";
import { businessDayStartUtc, businessDayEndUtc } from "../../../../shared/time/business-date";

// Cairo business day of a timestamptz column as plain text (no JS Date / server time zone involved)
function cairoDay(column: PgColumn): SQL<string> {
  return sql<string>`to_char((${column} AT TIME ZONE 'Africa/Cairo'), 'YYYY-MM-DD')`;
}

function toDateStr(d: Date | string): string {
  if (typeof d === "string") return d;
  return d.toISOString().slice(0, 10);
}

const REVENUE = sql<string>`COALESCE(SUM(${orders.total}), 0)`;

// a select-list alias (GROUP BY / ORDER BY "alias")
const selected = (alias: string) => sql`${sql.identifier(alias)}`;

@Injectable()
export class SalesOpsReader implements SalesOpsReaderPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private rangeTs(from: string, to: string): { fromTs: Date; toTs: Date } {
    return { fromTs: businessDayStartUtc(from), toTs: businessDayEndUtc(to) };
  }

  // Non-cancelled orders created in the range (optionally one branch)
  private activeOrdersIn(fromTs: Date, toTs: Date, branchId: string | null): SQL | undefined {
    return and(
      ne(orders.status, "cancelled"),
      gte(orders.created_at, fromTs),
      lte(orders.created_at, toTs),
      branchId ? eq(orders.branch_id, branchId) : undefined
    );
  }

  async getDailySummary(input: { branchId: string | null; from: string; to: string }): Promise<DailyBranchSummaryRow[]> {
    const { fromTs, toTs } = this.rangeTs(input.from, input.to);
    const rows = await this.db
      .select({
        business_date: cairoDay(orders.created_at).as("business_date"),
        branch_id: orders.branch_id,
        branch_name: branches.name,
        orders_count: count(orders.id),
        revenue: REVENUE,
      })
      .from(orders)
      .innerJoin(branches, eq(branches.id, orders.branch_id))
      .where(this.activeOrdersIn(fromTs, toTs, input.branchId))
      .groupBy(selected("business_date"), orders.branch_id, branches.name)
      .orderBy(selected("business_date"));
    return rows.map((r) => ({
      businessDate: toDateStr(r.business_date),
      branchId: r.branch_id,
      branchName: r.branch_name,
      ordersCount: Number(r.orders_count),
      revenue: Number(r.revenue),
    }));
  }

  async getSalesDetail(input: { branchId: string | null; from: string; to: string }): Promise<SalesDetailReport> {
    const { fromTs, toTs } = this.rangeTs(input.from, input.to);
    const where = this.activeOrdersIn(fromTs, toTs, input.branchId);

    const [summaryRow] = await this.db.select({ orders_count: count(orders.id), revenue: REVENUE }).from(orders).where(where);

    const byPaymentMethodRows = await this.db
      .select({ name: paymentMethods.name, kind: paymentMethods.kind, amount: REVENUE, count: count(orders.id) })
      .from(orders)
      .leftJoin(paymentMethods, eq(paymentMethods.id, orders.payment_method_id))
      .where(where)
      .groupBy(paymentMethods.name, paymentMethods.kind);

    const byOrderTypeRows = await this.db
      .select({ order_type: orders.order_type, amount: REVENUE, count: count(orders.id) })
      .from(orders)
      .where(where)
      .groupBy(orders.order_type);

    const dailyTrendRows = await this.db
      .select({ date: cairoDay(orders.created_at).as("date"), revenue: REVENUE, orders_count: count(orders.id) })
      .from(orders)
      .where(where)
      .groupBy(selected("date"))
      .orderBy(selected("date"));

    const ordersCount = Number(summaryRow.orders_count);
    const revenue = Number(summaryRow.revenue);
    return {
      from: input.from,
      to: input.to,
      branchId: input.branchId,
      summary: { revenue, ordersCount, avgOrderValue: ordersCount > 0 ? revenue / ordersCount : 0 },
      byPaymentMethod: byPaymentMethodRows.map((r) => ({ name: r.name ?? "بدون طريقة دفع", kind: r.kind, amount: Number(r.amount), count: Number(r.count) })),
      byOrderType: byOrderTypeRows.map((r) => ({ orderType: r.order_type, amount: Number(r.amount), count: Number(r.count) })),
      dailyTrend: dailyTrendRows.map((r) => ({ date: toDateStr(r.date), revenue: Number(r.revenue), ordersCount: Number(r.orders_count) })),
    };
  }

  async getCancelledOrders(input: { branchId: string | null; from: string; to: string }): Promise<CancelledOrdersReport> {
    const { fromTs, toTs } = this.rangeTs(input.from, input.to);
    const rows = await this.db
      .select({
        id: orders.id,
        branch_id: orders.branch_id,
        branch_name: branches.name,
        order_type: orders.order_type,
        total: orders.total,
        customer_name: orders.customer_name,
        customer_phone: orders.customer_phone,
        created_at: orders.created_at,
      })
      .from(orders)
      .leftJoin(branches, eq(branches.id, orders.branch_id))
      .where(
        and(
          eq(orders.status, "cancelled"),
          gte(orders.created_at, fromTs),
          lte(orders.created_at, toTs),
          input.branchId ? eq(orders.branch_id, input.branchId) : undefined
        )
      )
      .orderBy(desc(orders.created_at));

    return {
      from: input.from,
      to: input.to,
      branchId: input.branchId,
      summary: { totalCount: rows.length, totalValue: rows.reduce((s, r) => s + Number(r.total), 0) },
      orders: rows.map((r) => ({
        id: r.id,
        branchId: r.branch_id,
        branchName: r.branch_name,
        orderType: r.order_type,
        total: Number(r.total),
        customerName: r.customer_name,
        customerPhone: r.customer_phone,
        createdAt: r.created_at.toISOString(),
      })),
    };
  }

  async getDelays(input: { branchId: string | null; from: string; to: string; thresholdMinutes: number }): Promise<DelaysReport> {
    const { fromTs, toTs } = this.rangeTs(input.from, input.to);
    const rows = await this.db
      .select({
        id: orders.id,
        branch_id: orders.branch_id,
        branch_name: branches.name,
        order_type: orders.order_type,
        status: orders.status,
        created_at: orders.created_at,
        kitchen_ready_at: orders.kitchen_ready_at,
      })
      .from(orders)
      .leftJoin(branches, eq(branches.id, orders.branch_id))
      .where(
        and(gte(orders.created_at, fromTs), lte(orders.created_at, toTs), input.branchId ? eq(orders.branch_id, input.branchId) : undefined)
      );

    const withPrepMinutes = rows.map((r) => {
      const resolvedAt = r.kitchen_ready_at ?? new Date();
      const prepMinutes = (resolvedAt.getTime() - r.created_at.getTime()) / 60000;
      return { ...r, prepMinutes };
    });
    const delayed = withPrepMinutes
      .filter((r) => r.prepMinutes > input.thresholdMinutes)
      .sort((a, b) => b.prepMinutes - a.prepMinutes)
      .map((r) => ({
        id: r.id,
        branchId: r.branch_id,
        branchName: r.branch_name,
        orderType: r.order_type,
        status: r.status,
        createdAt: r.created_at.toISOString(),
        resolvedAt: r.kitchen_ready_at ? r.kitchen_ready_at.toISOString() : null,
        prepMinutes: r.prepMinutes,
      }));

    return {
      from: input.from,
      to: input.to,
      branchId: input.branchId,
      thresholdMinutes: input.thresholdMinutes,
      summary: {
        totalOrders: rows.length,
        delayedCount: delayed.length,
        delayedPercent: rows.length > 0 ? delayed.length / rows.length : 0,
        avgPrepMinutes: withPrepMinutes.length > 0 ? withPrepMinutes.reduce((s, r) => s + r.prepMinutes, 0) / withPrepMinutes.length : 0,
      },
      delayedOrders: delayed,
    };
  }

  async getItemPerformance(input: { branchId: string | null; from: string; to: string; limit: number }): Promise<ItemPerformanceReport> {
    const { fromTs, toTs } = this.rangeTs(input.from, input.to);
    const where = this.activeOrdersIn(fromTs, toTs, input.branchId);

    const variantRows = await this.db
      .select({
        variant_id: orderItems.variant_id,
        item_name: menuItems.name,
        label: menuItemVariants.label,
        quantity: sum(orderItems.quantity),
        revenue: sum(orderItems.line_total),
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.order_id))
      .innerJoin(menuItemVariants, eq(menuItemVariants.id, orderItems.variant_id))
      .innerJoin(menuItems, eq(menuItems.id, menuItemVariants.item_id))
      .where(and(where, isNotNull(orderItems.variant_id)))
      .groupBy(orderItems.variant_id, menuItems.name, menuItemVariants.label);

    const comboRows = await this.db
      .select({ combo_id: orderItems.combo_id, name: combos.name, quantity: sum(orderItems.quantity), revenue: sum(orderItems.line_total) })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.order_id))
      .innerJoin(combos, eq(combos.id, orderItems.combo_id))
      .where(and(where, isNotNull(orderItems.combo_id)))
      .groupBy(orderItems.combo_id, combos.name);

    const variantIds = variantRows.map((r) => r.variant_id).filter((id): id is string => id !== null);
    const costByVariant = await this.recipeCostByVariant(variantIds);

    const items: ItemPerformanceRow[] = [
      ...variantRows.map((r) => {
        const revenue = Number(r.revenue);
        const quantity = Number(r.quantity);
        const costInfo = r.variant_id !== null ? costByVariant.get(r.variant_id) : undefined;
        const unitCost = costInfo?.cost ?? null;
        const cost = unitCost !== null ? unitCost * quantity : 0;
        return {
          name: `${r.item_name} - ${r.label}`,
          quantity,
          revenue,
          cost,
          profit: revenue - cost,
          costIncomplete: unitCost === null,
        };
      }),
      // تكلفة العروض (Combos) مش محسوبة هنا - محتاجة تفكيك لكل مكوّناتها والريسبي بتاعهم، نطاق تكميلي
      // مؤجّل صراحة (نفس فلسفة قرارات النطاق الموثّقة في هذا القارئ)
      ...comboRows.map((r) => ({
        name: r.name,
        quantity: Number(r.quantity),
        revenue: Number(r.revenue),
        cost: 0,
        profit: Number(r.revenue),
        costIncomplete: true,
      })),
    ];

    const sortedBy = (fn: (i: ItemPerformanceRow) => number, dir: 1 | -1) =>
      [...items].sort((a, b) => dir * (fn(a) - fn(b))).slice(0, input.limit);

    return {
      from: input.from,
      to: input.to,
      branchId: input.branchId,
      topByRevenue: sortedBy((i) => i.revenue, -1),
      topByQuantity: sortedBy((i) => i.quantity, -1),
      leastByQuantity: sortedBy((i) => i.quantity, 1),
      leastProfitable: sortedBy((i) => i.profit, 1),
    };
  }

  async getCatalogReport(input: { branchId: string | null; from: string; to: string }): Promise<CatalogReport> {
    const { fromTs, toTs } = this.rangeTs(input.from, input.to);

    const salesRows = await this.db
      .select({ variant_id: orderItems.variant_id, quantity: sum(orderItems.quantity), revenue: sum(orderItems.line_total) })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.order_id))
      .where(and(this.activeOrdersIn(fromTs, toTs, input.branchId), isNotNull(orderItems.variant_id)))
      .groupBy(orderItems.variant_id);
    const salesByVariant = new Map(salesRows.map((r) => [r.variant_id as string, { quantity: Number(r.quantity), revenue: Number(r.revenue) }]));

    const variants = await this.db
      .select({
        item_id: menuItems.id,
        item_name: menuItems.name,
        category: menuCategories.name,
        is_active: menuItems.is_active,
        variant_id: menuItemVariants.id,
        label: menuItemVariants.label,
        price: menuItemVariants.price,
        talabat_price: menuItemVariants.talabat_price,
      })
      .from(menuItemVariants)
      .innerJoin(menuItems, eq(menuItems.id, menuItemVariants.item_id))
      .leftJoin(menuCategories, eq(menuCategories.id, menuItems.category_id))
      .orderBy(asc(menuCategories.name), asc(menuItems.name));

    return {
      from: input.from,
      to: input.to,
      branchId: input.branchId,
      items: variants.map((v) => {
        const sales = salesByVariant.get(v.variant_id) ?? { quantity: 0, revenue: 0 };
        return {
          itemId: v.item_id,
          itemName: v.item_name,
          category: v.category,
          isActive: v.is_active,
          variantId: v.variant_id,
          label: v.label,
          price: Number(v.price),
          talabatPrice: v.talabat_price != null ? Number(v.talabat_price) : null,
          quantitySold: sales.quantity,
          revenue: sales.revenue,
        };
      }),
    };
  }

  async getRecipesReport(): Promise<RecipeReportRow[]> {
    const variants = await this.db
      .select({
        variant_id: menuItemVariants.id,
        label: menuItemVariants.label,
        price: menuItemVariants.price,
        item_name: menuItems.name,
      })
      .from(menuItemVariants)
      .innerJoin(menuItems, eq(menuItems.id, menuItemVariants.item_id))
      .orderBy(asc(menuItems.name));

    const recipeRows = await this.db
      .select({ variant_id: recipes.variant_id, version_id: recipeVersions.id })
      .from(recipes)
      .innerJoin(recipeVersions, eq(recipeVersions.recipe_id, recipes.id))
      .where(and(eq(recipes.recipe_type, "sellable_variant"), eq(recipeVersions.status, "ACTIVE")));
    const activeVersionByVariant = new Map(recipeRows.filter((r) => r.variant_id !== null).map((r) => [r.variant_id as string, r.version_id]));

    const versionIds = [...activeVersionByVariant.values()];
    const ingredientRows =
      versionIds.length > 0
        ? await this.db
            .select({
              recipe_version_id: recipeIngredients.recipe_version_id,
              ingredient: inventoryItems.name,
              unit: recipeIngredients.unit,
              quantity_per_unit: recipeIngredients.quantity,
              unit_cost: inventoryItems.unit_cost,
            })
            .from(recipeIngredients)
            .innerJoin(inventoryItems, eq(inventoryItems.id, recipeIngredients.ingredient_item_id))
            .where(inArray(recipeIngredients.recipe_version_id, versionIds))
            .orderBy(asc(inventoryItems.name))
        : [];
    const ingredientsByVersion = new Map<string, typeof ingredientRows>();
    for (const row of ingredientRows) {
      const list = ingredientsByVersion.get(row.recipe_version_id) ?? [];
      list.push(row);
      ingredientsByVersion.set(row.recipe_version_id, list);
    }

    return variants.map((v) => {
      const versionId = activeVersionByVariant.get(v.variant_id);
      const ingredients = versionId ? (ingredientsByVersion.get(versionId) ?? []) : [];
      return {
        itemName: v.item_name,
        variantId: v.variant_id,
        label: v.label,
        price: Number(v.price),
        hasActiveVersion: !!versionId,
        hasMissingCost: ingredients.some((i) => i.unit_cost === null),
        ingredients: ingredients.map((i) => ({
          ingredient: i.ingredient,
          unit: i.unit,
          quantityPerUnit: Number(i.quantity_per_unit),
          unitCost: i.unit_cost != null ? Number(i.unit_cost) : null,
        })),
      };
    });
  }

  private async recipeCostByVariant(variantIds: string[]): Promise<Map<string, { cost: number | null }>> {
    if (variantIds.length === 0) return new Map();

    const recipeRows = await this.db
      .select({ variant_id: recipes.variant_id, version_id: recipeVersions.id })
      .from(recipes)
      .innerJoin(recipeVersions, eq(recipeVersions.recipe_id, recipes.id))
      .where(
        and(eq(recipes.recipe_type, "sellable_variant"), eq(recipeVersions.status, "ACTIVE"), inArray(recipes.variant_id, variantIds))
      );
    const versionByVariant = new Map(recipeRows.map((r) => [r.variant_id as string, r.version_id]));
    const versionIds = [...versionByVariant.values()];
    if (versionIds.length === 0) return new Map();

    const ingredientRows = await this.db
      .select({
        recipe_version_id: recipeIngredients.recipe_version_id,
        quantity: recipeIngredients.quantity,
        unit_cost: inventoryItems.unit_cost,
      })
      .from(recipeIngredients)
      .innerJoin(inventoryItems, eq(inventoryItems.id, recipeIngredients.ingredient_item_id))
      .where(inArray(recipeIngredients.recipe_version_id, versionIds));

    const costByVersion = new Map<string, { cost: number; incomplete: boolean }>();
    for (const row of ingredientRows) {
      const entry = costByVersion.get(row.recipe_version_id) ?? { cost: 0, incomplete: false };
      if (row.unit_cost === null) entry.incomplete = true;
      else entry.cost += Number(row.quantity) * Number(row.unit_cost);
      costByVersion.set(row.recipe_version_id, entry);
    }

    const result = new Map<string, { cost: number | null }>();
    for (const [variantId, versionId] of versionByVariant) {
      const costInfo = costByVersion.get(versionId);
      result.set(variantId, { cost: costInfo && !costInfo.incomplete ? costInfo.cost : null });
    }
    return result;
  }
}
