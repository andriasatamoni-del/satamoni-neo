import { Inject, Injectable } from "@nestjs/common";
import type { Kysely } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { assembleActionCenterAlerts } from "../../domain/action-center-assembler";
import type { ActionCenterAlert, ActionCenterReaderPort, ActionCenterReport } from "../../domain/ports/action-center-reader.port";
import { ListExceptionsHandler } from "../../../payment-control/application/queries/list-exceptions.handler";
import { GetPosSettingsHandler } from "../../../settings/application/queries/get-pos-settings.handler";
import { FOOD_COST_READER, type FoodCostReaderPort } from "../../domain/ports/food-cost-reader.port";

const FOOD_COST_VARIANCE_ALERT_PERCENT = 15;
const FOOD_COST_MIN_COST_EGP = 50;
const STALE_COMPLAINT_DAYS = 3;
const OVERDUE_INVOICE_STATUSES = ["MATCHED", "VARIANCE_PENDING", "APPROVED", "PARTIALLY_PAID"];

@Injectable()
export class KyselyActionCenterReader implements ActionCenterReaderPort {
  constructor(
    @Inject(KYSELY) private readonly db: Kysely<Database>,
    private readonly listExceptions: ListExceptionsHandler,
    private readonly getPosSettings: GetPosSettingsHandler,
    @Inject(FOOD_COST_READER) private readonly foodCostReader: FoodCostReaderPort
  ) {}

  async getAlerts(input: { branchId: string | null; fromTs: Date; toTs: Date }): Promise<ActionCenterReport> {
    const [
      negativeStock,
      paymentExceptions,
      productionVariance,
      expenseAnomalies,
      foodCostVariance,
      itemsMissingCost,
      overdueSupplierInvoices,
      staleComplaints,
    ] = await Promise.all([
      this.findNegativeStockAlerts(input.branchId),
      this.findPaymentExceptionAlerts(input.branchId),
      this.findProductionVarianceAlerts(input),
      this.findExpenseAnomalyAlerts(input),
      this.findFoodCostVarianceAlerts(input),
      this.findItemsMissingCostAlerts(input.branchId),
      this.findOverdueSupplierInvoiceAlerts(input.branchId),
      this.findStaleComplaintAlerts(input.branchId),
    ]);

    const { alerts, countsBySeverity } = assembleActionCenterAlerts([
      negativeStock,
      paymentExceptions,
      productionVariance,
      expenseAnomalies,
      foodCostVariance,
      itemsMissingCost,
      overdueSupplierInvoices,
      staleComplaints,
    ]);

    return { from: input.fromTs.toISOString().slice(0, 10), to: input.toTs.toISOString().slice(0, 10), alerts, countsBySeverity };
  }

  private async findNegativeStockAlerts(branchId: string | null): Promise<ActionCenterAlert[]> {
    let query = this.db
      .selectFrom("branch_stock_balances")
      .innerJoin("branches", "branches.id", "branch_stock_balances.branch_id")
      .select(["branch_stock_balances.branch_id as branch_id", "branches.name as branch_name"])
      .select((eb) => eb.fn.count("branch_stock_balances.inventory_item_id").as("item_count"))
      .where("branch_stock_balances.quantity", "<", 0)
      .groupBy(["branch_stock_balances.branch_id", "branches.name"]);
    if (branchId) query = query.where("branch_stock_balances.branch_id", "=", branchId);
    const rows = await query.execute();

    return rows.map((r) => ({
      type: "NEGATIVE_STOCK",
      severity: "HIGH" as const,
      branchId: r.branch_id,
      branchName: r.branch_name,
      description: `${r.item_count} صنف برصيد سالب في ${r.branch_name}`,
    }));
  }

  private async findPaymentExceptionAlerts(branchId: string | null): Promise<ActionCenterAlert[]> {
    const exceptions = await this.listExceptions.execute(branchId ? { branchId } : undefined);
    return exceptions.map((e) => ({
      type: `PAYMENT_${e.riskLevel === "عالي" ? "HIGH" : e.riskLevel === "متوسط" ? "MEDIUM" : "LOW"}`,
      severity: e.riskScore >= 60 ? ("HIGH" as const) : e.riskScore >= 30 ? ("MEDIUM" as const) : ("LOW" as const),
      branchId: e.branchId,
      branchName: null,
      description: e.reason,
    }));
  }

  private async findProductionVarianceAlerts(input: { branchId: string | null; fromTs: Date; toTs: Date }): Promise<ActionCenterAlert[]> {
    const settings = await this.getPosSettings.execute();
    const threshold = settings.productionVarianceAlertPercent;

    let query = this.db
      .selectFrom("conversion_orders")
      .innerJoin("branches", "branches.id", "conversion_orders.branch_id")
      .select([
        "conversion_orders.branch_id as branch_id",
        "branches.name as branch_name",
        "conversion_orders.variance_reason as variance_reason",
        "conversion_orders.planned_output_quantity as planned_output_quantity",
        "conversion_orders.actual_output_quantity as actual_output_quantity",
      ])
      .where("conversion_orders.status", "=", "COMPLETED")
      .where("conversion_orders.completed_at", ">=", input.fromTs)
      .where("conversion_orders.completed_at", "<=", input.toTs)
      .where("conversion_orders.planned_output_quantity", ">", 0);
    if (input.branchId) query = query.where("conversion_orders.branch_id", "=", input.branchId);
    const rows = await query.execute();

    return rows
      .map((r) => {
        const planned = Number(r.planned_output_quantity);
        const actual = Number(r.actual_output_quantity ?? 0);
        const percent = (Math.abs(actual - planned) / planned) * 100;
        return { ...r, planned, actual, percent };
      })
      .filter((r) => r.percent > threshold)
      .map((r) => ({
        type: "PRODUCTION_VARIANCE_DOCUMENTED",
        severity: "LOW" as const,
        branchId: r.branch_id,
        branchName: r.branch_name,
        description: `فرق تصنيع ${r.percent.toFixed(1)}% في ${r.branch_name} - السبب المسجّل: ${r.variance_reason ?? "—"}`,
        detail: `مخطط ${r.planned} / فعلي ${r.actual}`,
      }));
  }

  private async findExpenseAnomalyAlerts(input: { branchId: string | null; fromTs: Date; toTs: Date }): Promise<ActionCenterAlert[]> {
    let query = this.db
      .selectFrom("expenses")
      .innerJoin("expense_categories", "expense_categories.id", "expenses.category_id")
      .innerJoin("branches", "branches.id", "expenses.branch_id")
      .select([
        "expenses.branch_id as branch_id",
        "branches.name as branch_name",
        "expense_categories.name as category_name",
        "expenses.amount as amount",
        "expense_categories.alert_threshold as alert_threshold",
      ])
      .where("expenses.business_date", ">=", input.fromTs)
      .where("expenses.business_date", "<=", input.toTs)
      .where("expense_categories.alert_threshold", "is not", null)
      .whereRef("expenses.amount", ">", "expense_categories.alert_threshold");
    if (input.branchId) query = query.where("expenses.branch_id", "=", input.branchId);
    const rows = await query.execute();

    return rows.map((r) => ({
      type: "EXPENSE_OVER_THRESHOLD",
      severity: "MEDIUM" as const,
      branchId: r.branch_id,
      branchName: r.branch_name,
      description: `مصروف "${r.category_name}" بمبلغ ${Number(r.amount).toFixed(2)} ج.م تجاوز حد التنبيه (${Number(r.alert_threshold).toFixed(2)} ج.م)`,
    }));
  }

  private async findFoodCostVarianceAlerts(input: { branchId: string | null; fromTs: Date; toTs: Date }): Promise<ActionCenterAlert[]> {
    const report = await this.foodCostReader.getVariance(input);
    return report.byItem
      .filter((row) => {
        if (row.theoreticalCost <= 0) return false;
        const percent = Math.abs(row.variancePercent ?? 0);
        return percent > FOOD_COST_VARIANCE_ALERT_PERCENT && Math.abs(row.variance) >= FOOD_COST_MIN_COST_EGP;
      })
      .slice(0, 10)
      .map((row) => ({
        type: "FOOD_COST_VARIANCE",
        severity: "MEDIUM" as const,
        branchId: input.branchId,
        branchName: input.branchId ? null : "كل الفروع",
        description: `فرق تكلفة "${row.itemName}": ${row.variance.toFixed(2)} ج.م (${(row.variancePercent ?? 0).toFixed(1)}%)`,
      }));
  }

  private async findItemsMissingCostAlerts(branchId: string | null): Promise<ActionCenterAlert[]> {
    if (branchId) return []; // بيانات الصنف الأساسية شركة-wide مش خاصة بفرع - نفس قرار الريبو القديم بالظبط
    const rows = await this.db
      .selectFrom("inventory_items")
      .innerJoin("recipe_ingredients", "recipe_ingredients.ingredient_item_id", "inventory_items.id")
      .innerJoin("recipe_versions", (join) =>
        join.onRef("recipe_versions.id", "=", "recipe_ingredients.recipe_version_id").on("recipe_versions.status", "=", "ACTIVE")
      )
      .select(["inventory_items.id as id", "inventory_items.name as name"])
      .where("inventory_items.unit_cost", "is", null)
      .distinct()
      .orderBy("inventory_items.name")
      .execute();
    if (rows.length === 0) return [];
    return [
      {
        type: "ITEMS_MISSING_COST",
        severity: "HIGH",
        branchId: null,
        branchName: "كل الفروع",
        description: `${rows.length} صنف مستخدم في وصفات نشطة من غير تكلفة وحدة مسجّلة - بيأثر على دقة تكلفة الطعام لأي وصفة بتستخدمه`,
        detail: rows.slice(0, 8).map((r) => r.name).join("، "),
      },
    ];
  }

  private async findOverdueSupplierInvoiceAlerts(branchId: string | null): Promise<ActionCenterAlert[]> {
    let query = this.db
      .selectFrom("supplier_invoices")
      .innerJoin("branches", "branches.id", "supplier_invoices.branch_id")
      .innerJoin("suppliers", "suppliers.id", "supplier_invoices.supplier_id")
      .leftJoin("supplier_payments", "supplier_payments.supplier_invoice_id", "supplier_invoices.id")
      .select([
        "supplier_invoices.branch_id as branch_id",
        "branches.name as branch_name",
        "supplier_invoices.id as invoice_id",
        "suppliers.name as supplier_name",
        "supplier_invoices.total as total",
      ])
      .select((eb) => eb.fn.coalesce(eb.fn.sum("supplier_payments.amount"), eb.lit(0)).as("paid"))
      .where("supplier_invoices.status", "in", OVERDUE_INVOICE_STATUSES)
      .where("supplier_invoices.due_date", "is not", null)
      .where("supplier_invoices.due_date", "<", new Date())
      .groupBy([
        "supplier_invoices.id",
        "supplier_invoices.branch_id",
        "branches.name",
        "suppliers.name",
        "supplier_invoices.total",
      ]);
    if (branchId) query = query.where("supplier_invoices.branch_id", "=", branchId);
    const rows = await query.execute();

    const remaining = rows
      .map((r) => ({ ...r, remainingValue: Number(r.total) - Number(r.paid) }))
      .filter((r) => r.remainingValue > 0);
    if (remaining.length === 0) return [];

    const byBranch = new Map<string, { branchName: string; count: number; remaining: number; suppliers: Set<string> }>();
    for (const r of remaining) {
      const entry = byBranch.get(r.branch_id) ?? { branchName: r.branch_name, count: 0, remaining: 0, suppliers: new Set() };
      entry.count += 1;
      entry.remaining += r.remainingValue;
      entry.suppliers.add(r.supplier_name);
      byBranch.set(r.branch_id, entry);
    }

    return [...byBranch.entries()].map(([bId, e]) => ({
      type: "OVERDUE_SUPPLIER_INVOICES",
      severity: "MEDIUM" as const,
      branchId: bId,
      branchName: e.branchName,
      description: `${e.count} فاتورة مورد فات معاد استحقاقها في ${e.branchName} - مبلغ متبقي ${e.remaining.toFixed(2)} ج.م`,
      detail: [...e.suppliers].slice(0, 5).join("، "),
    }));
  }

  private async findStaleComplaintAlerts(branchId: string | null): Promise<ActionCenterAlert[]> {
    const staleCutoff = new Date(Date.now() - STALE_COMPLAINT_DAYS * 24 * 60 * 60 * 1000);
    let query = this.db
      .selectFrom("complaints")
      .innerJoin("branches", "branches.id", "complaints.branch_id")
      .select(["complaints.branch_id as branch_id", "branches.name as branch_name"])
      .select((eb) => eb.fn.count("complaints.id").as("stale_count"))
      .where("complaints.status", "in", ["open", "in_progress"])
      .where("complaints.created_at", "<", staleCutoff)
      .groupBy(["complaints.branch_id", "branches.name"]);
    if (branchId) query = query.where("complaints.branch_id", "=", branchId);
    const rows = await query.execute();

    return rows.map((r) => ({
      type: "STALE_COMPLAINTS",
      severity: "MEDIUM" as const,
      branchId: r.branch_id,
      branchName: r.branch_name,
      description: `${r.stale_count} شكوى عميل فاضلة من غير حل لأكتر من ${STALE_COMPLAINT_DAYS} أيام في ${r.branch_name}`,
    }));
  }
}
