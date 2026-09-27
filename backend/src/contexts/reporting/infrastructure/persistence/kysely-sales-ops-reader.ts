import { Inject, Injectable } from "@nestjs/common";
import type { Kysely } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
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

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class KyselySalesOpsReader implements SalesOpsReaderPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  private rangeTs(from: string, to: string): { fromTs: Date; toTs: Date } {
    return { fromTs: new Date(`${from}T00:00:00.000`), toTs: new Date(`${to}T23:59:59.999`) };
  }

  async getDailySummary(input: { branchId: string | null; from: string; to: string }): Promise<DailyBranchSummaryRow[]> {
    const { fromTs, toTs } = this.rangeTs(input.from, input.to);
    let query = this.db
      .selectFrom("orders")
      .innerJoin("branches", "branches.id", "orders.branch_id")
      .select([(eb) => eb.fn<Date>("date", [eb.ref("orders.created_at")]).as("business_date"), "orders.branch_id as branch_id", "branches.name as branch_name"])
      .select((eb) => eb.fn.count("orders.id").as("orders_count"))
      .select((eb) => eb.fn.coalesce(eb.fn.sum("orders.total"), eb.lit(0)).as("revenue"))
      .where("orders.status", "<>", "cancelled")
      .where("orders.created_at", ">=", fromTs)
      .where("orders.created_at", "<=", toTs)
      .groupBy(["business_date", "orders.branch_id", "branches.name"])
      .orderBy("business_date");
    if (input.branchId) query = query.where("orders.branch_id", "=", input.branchId);
    const rows = await query.execute();
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

    let summaryQuery = this.db
      .selectFrom("orders")
      .select((eb) => eb.fn.count("id").as("orders_count"))
      .select((eb) => eb.fn.coalesce(eb.fn.sum("total"), eb.lit(0)).as("revenue"))
      .where("status", "<>", "cancelled")
      .where("created_at", ">=", fromTs)
      .where("created_at", "<=", toTs);
    if (input.branchId) summaryQuery = summaryQuery.where("branch_id", "=", input.branchId);
    const summaryRow = await summaryQuery.executeTakeFirstOrThrow();

    let byPaymentMethodQuery = this.db
      .selectFrom("orders")
      .leftJoin("payment_methods", "payment_methods.id", "orders.payment_method_id")
      .select(["payment_methods.name as name", "payment_methods.kind as kind"])
      .select((eb) => eb.fn.coalesce(eb.fn.sum("orders.total"), eb.lit(0)).as("amount"))
      .select((eb) => eb.fn.count("orders.id").as("count"))
      .where("orders.status", "<>", "cancelled")
      .where("orders.created_at", ">=", fromTs)
      .where("orders.created_at", "<=", toTs)
      .groupBy(["payment_methods.name", "payment_methods.kind"]);
    if (input.branchId) byPaymentMethodQuery = byPaymentMethodQuery.where("orders.branch_id", "=", input.branchId);
    const byPaymentMethodRows = await byPaymentMethodQuery.execute();

    let byOrderTypeQuery = this.db
      .selectFrom("orders")
      .select("order_type as order_type")
      .select((eb) => eb.fn.coalesce(eb.fn.sum("total"), eb.lit(0)).as("amount"))
      .select((eb) => eb.fn.count("id").as("count"))
      .where("status", "<>", "cancelled")
      .where("created_at", ">=", fromTs)
      .where("created_at", "<=", toTs)
      .groupBy("order_type");
    if (input.branchId) byOrderTypeQuery = byOrderTypeQuery.where("branch_id", "=", input.branchId);
    const byOrderTypeRows = await byOrderTypeQuery.execute();

    let dailyTrendQuery = this.db
      .selectFrom("orders")
      .select((eb) => eb.fn<Date>("date", [eb.ref("created_at")]).as("date"))
      .select((eb) => eb.fn.coalesce(eb.fn.sum("total"), eb.lit(0)).as("revenue"))
      .select((eb) => eb.fn.count("id").as("orders_count"))
      .where("status", "<>", "cancelled")
      .where("created_at", ">=", fromTs)
      .where("created_at", "<=", toTs)
      .groupBy("date")
      .orderBy("date");
    if (input.branchId) dailyTrendQuery = dailyTrendQuery.where("branch_id", "=", input.branchId);
    const dailyTrendRows = await dailyTrendQuery.execute();

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
    let query = this.db
      .selectFrom("orders")
      .leftJoin("branches", "branches.id", "orders.branch_id")
      .select([
        "orders.id as id",
        "orders.branch_id as branch_id",
        "branches.name as branch_name",
        "orders.order_type as order_type",
        "orders.total as total",
        "orders.customer_name as customer_name",
        "orders.customer_phone as customer_phone",
        "orders.created_at as created_at",
      ])
      .where("orders.status", "=", "cancelled")
      .where("orders.created_at", ">=", fromTs)
      .where("orders.created_at", "<=", toTs)
      .orderBy("orders.created_at", "desc");
    if (input.branchId) query = query.where("orders.branch_id", "=", input.branchId);
    const rows = await query.execute();

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
    let query = this.db
      .selectFrom("orders")
      .leftJoin("branches", "branches.id", "orders.branch_id")
      .select([
        "orders.id as id",
        "orders.branch_id as branch_id",
        "branches.name as branch_name",
        "orders.order_type as order_type",
        "orders.status as status",
        "orders.created_at as created_at",
        "orders.kitchen_ready_at as kitchen_ready_at",
      ])
      .where("orders.created_at", ">=", fromTs)
      .where("orders.created_at", "<=", toTs);
    if (input.branchId) query = query.where("orders.branch_id", "=", input.branchId);
    const rows = await query.execute();

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

    let variantQuery = this.db
      .selectFrom("order_items")
      .innerJoin("orders", "orders.id", "order_items.order_id")
      .innerJoin("menu_item_variants", "menu_item_variants.id", "order_items.variant_id")
      .innerJoin("menu_items", "menu_items.id", "menu_item_variants.item_id")
      .select(["order_items.variant_id as variant_id", "menu_items.name as item_name", "menu_item_variants.label as label"])
      .select((eb) => eb.fn.sum("order_items.quantity").as("quantity"))
      .select((eb) => eb.fn.sum("order_items.line_total").as("revenue"))
      .where("orders.status", "<>", "cancelled")
      .where("orders.created_at", ">=", fromTs)
      .where("orders.created_at", "<=", toTs)
      .where("order_items.variant_id", "is not", null)
      .groupBy(["order_items.variant_id", "menu_items.name", "menu_item_variants.label"]);
    if (input.branchId) variantQuery = variantQuery.where("orders.branch_id", "=", input.branchId);
    const variantRows = await variantQuery.execute();

    let comboQuery = this.db
      .selectFrom("order_items")
      .innerJoin("orders", "orders.id", "order_items.order_id")
      .innerJoin("combos", "combos.id", "order_items.combo_id")
      .select(["order_items.combo_id as combo_id", "combos.name as name"])
      .select((eb) => eb.fn.sum("order_items.quantity").as("quantity"))
      .select((eb) => eb.fn.sum("order_items.line_total").as("revenue"))
      .where("orders.status", "<>", "cancelled")
      .where("orders.created_at", ">=", fromTs)
      .where("orders.created_at", "<=", toTs)
      .where("order_items.combo_id", "is not", null)
      .groupBy(["order_items.combo_id", "combos.name"]);
    if (input.branchId) comboQuery = comboQuery.where("orders.branch_id", "=", input.branchId);
    const comboRows = await comboQuery.execute();

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

    let salesQuery = this.db
      .selectFrom("order_items")
      .innerJoin("orders", "orders.id", "order_items.order_id")
      .select("order_items.variant_id as variant_id")
      .select((eb) => eb.fn.sum("order_items.quantity").as("quantity"))
      .select((eb) => eb.fn.sum("order_items.line_total").as("revenue"))
      .where("orders.status", "<>", "cancelled")
      .where("orders.created_at", ">=", fromTs)
      .where("orders.created_at", "<=", toTs)
      .where("order_items.variant_id", "is not", null)
      .groupBy("order_items.variant_id");
    if (input.branchId) salesQuery = salesQuery.where("orders.branch_id", "=", input.branchId);
    const salesRows = await salesQuery.execute();
    const salesByVariant = new Map(salesRows.map((r) => [r.variant_id as string, { quantity: Number(r.quantity), revenue: Number(r.revenue) }]));

    const variants = await this.db
      .selectFrom("menu_item_variants")
      .innerJoin("menu_items", "menu_items.id", "menu_item_variants.item_id")
      .leftJoin("menu_categories", "menu_categories.id", "menu_items.category_id")
      .select([
        "menu_items.id as item_id",
        "menu_items.name as item_name",
        "menu_categories.name as category",
        "menu_items.is_active as is_active",
        "menu_item_variants.id as variant_id",
        "menu_item_variants.label as label",
        "menu_item_variants.price as price",
        "menu_item_variants.talabat_price as talabat_price",
      ])
      .orderBy("menu_categories.name")
      .orderBy("menu_items.name")
      .execute();

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
      .selectFrom("menu_item_variants")
      .innerJoin("menu_items", "menu_items.id", "menu_item_variants.item_id")
      .select(["menu_item_variants.id as variant_id", "menu_item_variants.label as label", "menu_item_variants.price as price", "menu_items.name as item_name"])
      .orderBy("menu_items.name")
      .execute();

    const recipes = await this.db
      .selectFrom("recipes")
      .innerJoin("recipe_versions", "recipe_versions.recipe_id", "recipes.id")
      .select(["recipes.variant_id as variant_id", "recipe_versions.id as version_id"])
      .where("recipes.recipe_type", "=", "sellable_variant")
      .where("recipe_versions.status", "=", "ACTIVE")
      .execute();
    const activeVersionByVariant = new Map(recipes.filter((r) => r.variant_id !== null).map((r) => [r.variant_id as string, r.version_id]));

    const versionIds = [...activeVersionByVariant.values()];
    const ingredientRows = versionIds.length > 0
      ? await this.db
          .selectFrom("recipe_ingredients")
          .innerJoin("inventory_items", "inventory_items.id", "recipe_ingredients.ingredient_item_id")
          .select([
            "recipe_ingredients.recipe_version_id as recipe_version_id",
            "inventory_items.name as ingredient",
            "recipe_ingredients.unit as unit",
            "recipe_ingredients.quantity as quantity_per_unit",
            "inventory_items.unit_cost as unit_cost",
          ])
          .where("recipe_ingredients.recipe_version_id", "in", versionIds)
          .orderBy("inventory_items.name")
          .execute()
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

    const recipes = await this.db
      .selectFrom("recipes")
      .innerJoin("recipe_versions", "recipe_versions.recipe_id", "recipes.id")
      .select(["recipes.variant_id as variant_id", "recipe_versions.id as version_id"])
      .where("recipes.recipe_type", "=", "sellable_variant")
      .where("recipe_versions.status", "=", "ACTIVE")
      .where("recipes.variant_id", "in", variantIds)
      .execute();
    const versionByVariant = new Map(recipes.map((r) => [r.variant_id as string, r.version_id]));
    const versionIds = [...versionByVariant.values()];
    if (versionIds.length === 0) return new Map();

    const ingredientRows = await this.db
      .selectFrom("recipe_ingredients")
      .innerJoin("inventory_items", "inventory_items.id", "recipe_ingredients.ingredient_item_id")
      .select(["recipe_ingredients.recipe_version_id as recipe_version_id", "recipe_ingredients.quantity as quantity", "inventory_items.unit_cost as unit_cost"])
      .where("recipe_ingredients.recipe_version_id", "in", versionIds)
      .execute();

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
