import { and, asc, eq, gt, gte, inArray, isNotNull, isNull, ne, notExists, sql, sum, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { Executor } from "../../../../shared/database/database.token";
import { businessDateString } from "../../../../shared/time/business-date";
import { goodsReceiptItems, goodsReceipts } from "../../../procurement/infrastructure/persistence/procurement.tables";
import { orders } from "../../../orders/infrastructure/persistence/orders.tables";
import { stockMovements } from "../../../inventory/infrastructure/persistence/inventory.tables";
import { payrollRuns } from "../../../hr-payroll/infrastructure/persistence/hr-payroll.tables";
import { paymentAdjustmentRequests, payments } from "../../../payment-control/infrastructure/persistence/payment-control.tables";
import { accounts, journalEntries } from "./accounting.tables";

// Phase 3.1 (BL-08) - reconciliation of business transactions against their mandatory journals.
//
// Read-only. Reports every business transaction that SHOULD have a journal (or a reversal) according to the approved accounting
// rules but does not. It is the safety net behind the transactional posting: in strict mode gaps cannot appear for new
// transactions; in deferred mode (or for history produced by the pre-fix code) this report is the durable, queryable record of what is
// still missing, and the repair service consumes it. Legacy-imported rows (legacy_*_id not null) are excluded: their journals come
// from the accounting legacy import, not from the automatic posting.
export type GapKind =
  | "order_sale"
  | "order_cogs"
  | "order_cancellation_unreversed"
  | "goods_receipt_ap"
  | "payroll_posting"
  | "payroll_cancellation_unreversed"
  | "payment_adjustment";

export interface JournalGap {
  kind: GapKind;
  /** journal source type that is missing (or that must be reversed) */
  sourceType: string;
  /** business transaction id (order id, goods receipt id, payroll run id, adjustment request id) */
  sourceId: string;
  branchId: string | null;
  occurredAt: Date;
  /** Cairo business date of the transaction */
  businessDate: string;
  amount: number;
  reason: string;
}

export const ALL_GAP_KINDS: GapKind[] = [
  "order_sale",
  "order_cogs",
  "order_cancellation_unreversed",
  "goods_receipt_ap",
  "payroll_posting",
  "payroll_cancellation_unreversed",
  "payment_adjustment",
];

// "no journal with this source exists" - the business id is uuid, journal_entries.source_id is text
function notJournaled(db: Executor, sourceType: string, sourceId: AnyPgColumn): SQL {
  return notExists(
    db
      .select({ one: sql`1` })
      .from(journalEntries)
      .where(and(eq(journalEntries.source_type, sourceType), eq(journalEntries.source_id, sql`${sourceId}::text`)))
  );
}

export async function findJournalGaps(
  db: Executor,
  filter: { branchId?: string | null; kinds?: GapKind[]; limit?: number } = {}
): Promise<JournalGap[]> {
  const kinds = new Set(filter.kinds ?? ALL_GAP_KINDS);
  const limit = Math.min(Math.max(filter.limit ?? 500, 1), 5000);
  const branch = filter.branchId ?? null;
  const gaps: JournalGap[] = [];
  const push = (kind: GapKind, sourceType: string, row: { id: string; branch_id: string | null; at: Date; amount: unknown }, reason: string) =>
    gaps.push({
      kind,
      sourceType,
      sourceId: row.id,
      branchId: row.branch_id,
      occurredAt: row.at,
      businessDate: businessDateString(row.at),
      amount: Math.round(Number(row.amount ?? 0) * 100) / 100,
      reason,
    });

  if (kinds.has("order_sale")) {
    const rows = await db
      .select({ id: orders.id, branch_id: orders.branch_id, at: orders.created_at, amount: orders.total })
      .from(orders)
      .where(
        and(
          ne(orders.status, "cancelled"),
          gt(orders.total, 0),
          isNull(orders.legacy_order_id),
          notJournaled(db, "order_sale", orders.id),
          branch ? eq(orders.branch_id, branch) : undefined
        )
      )
      .orderBy(asc(orders.created_at))
      .limit(limit);
    for (const r of rows) push("order_sale", "order_sale", r, "الطلب مفيهوش قيد بيع");
  }

  if (kinds.has("order_cogs")) {
    const rows = await db
      .select({ id: orders.id, branch_id: orders.branch_id, at: orders.created_at, amount: sum(stockMovements.total_cost) })
      .from(orders)
      .innerJoin(
        stockMovements,
        and(
          eq(stockMovements.reference_type, "order"),
          eq(stockMovements.reference_id, sql`${orders.id}::text`),
          eq(stockMovements.movement_type, "CONSUMPTION")
        )
      )
      .where(
        and(
          ne(orders.status, "cancelled"),
          isNull(orders.legacy_order_id),
          notJournaled(db, "order_cogs", orders.id),
          branch ? eq(orders.branch_id, branch) : undefined
        )
      )
      .groupBy(orders.id, orders.branch_id, orders.created_at)
      .having(gt(sql`COALESCE(SUM(${stockMovements.total_cost}), 0)`, 0))
      .orderBy(asc(orders.created_at))
      .limit(limit);
    for (const r of rows) push("order_cogs", "order_cogs", r, "الطلب استهلك مخزون بتكلفة ومفيهوش قيد تكلفة (COGS)");
  }

  if (kinds.has("order_cancellation_unreversed")) {
    const rows = await db
      .select({
        id: orders.id,
        branch_id: orders.branch_id,
        at: orders.created_at,
        amount: orders.total,
        source_type: journalEntries.source_type,
      })
      .from(orders)
      .innerJoin(
        journalEntries,
        and(
          eq(journalEntries.source_id, sql`${orders.id}::text`),
          inArray(journalEntries.source_type, ["order_sale", "order_cogs"]),
          eq(journalEntries.status, "POSTED")
        )
      )
      .where(and(eq(orders.status, "cancelled"), branch ? eq(orders.branch_id, branch) : undefined))
      .orderBy(asc(orders.created_at))
      .limit(limit);
    for (const r of rows) push("order_cancellation_unreversed", r.source_type, r, "الطلب ملغي والقيد بتاعه لسه مش معكوس");
  }

  if (kinds.has("goods_receipt_ap")) {
    const at = sql<Date>`COALESCE(${goodsReceipts.confirmed_at}, ${goodsReceipts.created_at})`.mapWith(goodsReceipts.created_at);
    const value = sql`SUM(${goodsReceiptItems.quantity} * ${goodsReceiptItems.unit_cost})`;
    const rows = await db
      .select({ id: goodsReceipts.id, branch_id: goodsReceipts.branch_id, at, amount: sql<string>`${value}` })
      .from(goodsReceipts)
      .innerJoin(goodsReceiptItems, eq(goodsReceiptItems.goods_receipt_id, goodsReceipts.id))
      .where(
        and(
          eq(goodsReceipts.status, "CONFIRMED"),
          isNotNull(goodsReceipts.supplier_id),
          isNull(goodsReceipts.legacy_goods_receipt_id),
          notJournaled(db, "goods_receipt", goodsReceipts.id),
          branch ? eq(goodsReceipts.branch_id, branch) : undefined
        )
      )
      .groupBy(goodsReceipts.id, goodsReceipts.branch_id, goodsReceipts.confirmed_at, goodsReceipts.created_at)
      .having(gt(value, 0))
      .orderBy(at)
      .limit(limit);
    for (const r of rows) push("goods_receipt_ap", "goods_receipt", r, "استلام مؤكد لمورد ومفيهوش قيد مخزون/دائنون");
  }

  if (kinds.has("payroll_posting") && !branch) {
    const at = sql<Date>`COALESCE(${payrollRuns.approved_at}, ${payrollRuns.created_at})`.mapWith(payrollRuns.created_at);
    const rows = await db
      .select({ id: payrollRuns.id, at, amount: payrollRuns.total_net_pay })
      .from(payrollRuns)
      .where(
        and(
          eq(payrollRuns.status, "APPROVED"),
          isNull(payrollRuns.legacy_payroll_run_id),
          gt(payrollRuns.total_net_pay, 0),
          notJournaled(db, "payroll_run", payrollRuns.id)
        )
      )
      .orderBy(at)
      .limit(limit);
    for (const r of rows) push("payroll_posting", "payroll_run", { ...r, branch_id: null }, "قائمة رواتب معتمدة ومفيهاش قيد رواتب");
  }

  if (kinds.has("payroll_cancellation_unreversed") && !branch) {
    const at = sql<Date>`COALESCE(${payrollRuns.cancelled_at}, ${payrollRuns.created_at})`.mapWith(payrollRuns.created_at);
    const rows = await db
      .select({ id: payrollRuns.id, at, amount: payrollRuns.total_net_pay })
      .from(payrollRuns)
      .innerJoin(
        journalEntries,
        and(
          eq(journalEntries.source_type, "payroll_run"),
          eq(journalEntries.source_id, sql`${payrollRuns.id}::text`),
          eq(journalEntries.status, "POSTED")
        )
      )
      .where(eq(payrollRuns.status, "CANCELLED"))
      .orderBy(at)
      .limit(limit);
    for (const r of rows) push("payroll_cancellation_unreversed", "payroll_run", { ...r, branch_id: null }, "قائمة رواتب ملغاة وقيدها لسه مش معكوس");
  }

  if (kinds.has("payment_adjustment")) {
    const at = sql<Date>`COALESCE(${paymentAdjustmentRequests.decided_at}, ${paymentAdjustmentRequests.requested_at})`.mapWith(
      paymentAdjustmentRequests.requested_at
    );
    const delta = sql<string>`(${paymentAdjustmentRequests.proposed_amount} - ${paymentAdjustmentRequests.previous_amount})`;
    const rows = await db
      .select({ id: paymentAdjustmentRequests.id, branch_id: payments.branch_id, at, amount: delta })
      .from(paymentAdjustmentRequests)
      .innerJoin(payments, eq(payments.id, paymentAdjustmentRequests.payment_id))
      .where(
        and(
          eq(paymentAdjustmentRequests.status, "APPROVED"),
          isNotNull(paymentAdjustmentRequests.previous_amount),
          gte(sql`ABS(${delta})`, 0.005),
          notJournaled(db, "payment_adjustment", paymentAdjustmentRequests.id),
          branch ? eq(payments.branch_id, branch) : undefined
        )
      )
      .orderBy(at)
      .limit(limit);
    for (const r of rows) push("payment_adjustment", "payment_adjustment", r, "تعديل دفع معتمد بفرق مبلغ ومفيهوش قيد تصحيح");
  }

  return gaps;
}

// Required chart-of-accounts mappings for the Release-1 automatic postings
export const REQUIRED_ACCOUNTS: { code: string; purpose: string }[] = [
  { code: "1100", purpose: "الكاش - قيد البيع وتصحيح الدفع" },
  { code: "4100", purpose: "إيراد المبيعات - قيد البيع" },
  { code: "5100", purpose: "تكلفة البضاعة المباعة (COGS)" },
  { code: "1400", purpose: "المخزون - COGS والمشتريات والاستلام" },
  { code: "2100", purpose: "الموردين (دائنون) - استلام البضاعة وفروق الفواتير" },
  { code: "2400", purpose: "رواتب مستحقة - اعتماد الرواتب" },
  { code: "6100", purpose: "مصروف الرواتب - اعتماد الرواتب" },
  { code: "6950", purpose: "فروق كاش - تصحيح الدفع وفروق الشيفت والسائقين" },
];

export async function checkChartOfAccounts(db: Executor): Promise<{ code: string; purpose: string; present: boolean }[]> {
  const rows = await db
    .select({ code: accounts.code })
    .from(accounts)
    .where(
      inArray(
        accounts.code,
        REQUIRED_ACCOUNTS.map((a) => a.code)
      )
    );
  const present = new Set(rows.map((r) => r.code));
  return REQUIRED_ACCOUNTS.map((a) => ({ ...a, present: present.has(a.code) }));
}
