import { sql } from "kysely";
import type { Kysely } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { businessDateString } from "../../../../shared/time/business-date";

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

export async function findJournalGaps(
  db: Kysely<Database>,
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
    const { rows } = await sql<{ id: string; branch_id: string | null; at: Date; amount: string }>`
      SELECT o.id::text AS id, o.branch_id::text AS branch_id, o.created_at AS at, o.total AS amount
        FROM orders o
       WHERE o.status <> 'cancelled' AND o.total > 0 AND o.legacy_order_id IS NULL
         AND NOT EXISTS (SELECT 1 FROM journal_entries j WHERE j.source_type = 'order_sale' AND j.source_id = o.id::text)
         AND (${branch}::uuid IS NULL OR o.branch_id = ${branch}::uuid)
       ORDER BY o.created_at LIMIT ${limit}`.execute(db);
    for (const r of rows) push("order_sale", "order_sale", r, "الطلب مفيهوش قيد بيع");
  }

  if (kinds.has("order_cogs")) {
    const { rows } = await sql<{ id: string; branch_id: string | null; at: Date; amount: string }>`
      SELECT o.id::text AS id, o.branch_id::text AS branch_id, o.created_at AS at, SUM(m.total_cost) AS amount
        FROM orders o
        JOIN stock_movements m ON m.reference_type = 'order' AND m.reference_id = o.id::text AND m.movement_type = 'CONSUMPTION'
       WHERE o.status <> 'cancelled' AND o.legacy_order_id IS NULL
         AND NOT EXISTS (SELECT 1 FROM journal_entries j WHERE j.source_type = 'order_cogs' AND j.source_id = o.id::text)
         AND (${branch}::uuid IS NULL OR o.branch_id = ${branch}::uuid)
       GROUP BY o.id, o.branch_id, o.created_at
      HAVING COALESCE(SUM(m.total_cost), 0) > 0
       ORDER BY o.created_at LIMIT ${limit}`.execute(db);
    for (const r of rows) push("order_cogs", "order_cogs", r, "الطلب استهلك مخزون بتكلفة ومفيهوش قيد تكلفة (COGS)");
  }

  if (kinds.has("order_cancellation_unreversed")) {
    const { rows } = await sql<{ id: string; branch_id: string | null; at: Date; amount: string; source_type: string }>`
      SELECT o.id::text AS id, o.branch_id::text AS branch_id, o.created_at AS at, o.total AS amount, j.source_type
        FROM orders o
        JOIN journal_entries j ON j.source_id = o.id::text AND j.source_type IN ('order_sale', 'order_cogs') AND j.status = 'POSTED'
       WHERE o.status = 'cancelled'
         AND (${branch}::uuid IS NULL OR o.branch_id = ${branch}::uuid)
       ORDER BY o.created_at LIMIT ${limit}`.execute(db);
    for (const r of rows) push("order_cancellation_unreversed", r.source_type, r, "الطلب ملغي والقيد بتاعه لسه مش معكوس");
  }

  if (kinds.has("goods_receipt_ap")) {
    const { rows } = await sql<{ id: string; branch_id: string | null; at: Date; amount: string }>`
      SELECT g.id::text AS id, g.branch_id::text AS branch_id, COALESCE(g.confirmed_at, g.created_at) AS at, SUM(i.quantity * i.unit_cost) AS amount
        FROM goods_receipts g
        JOIN goods_receipt_items i ON i.goods_receipt_id = g.id
       WHERE g.status = 'CONFIRMED' AND g.supplier_id IS NOT NULL AND g.legacy_goods_receipt_id IS NULL
         AND NOT EXISTS (SELECT 1 FROM journal_entries j WHERE j.source_type = 'goods_receipt' AND j.source_id = g.id::text)
         AND (${branch}::uuid IS NULL OR g.branch_id = ${branch}::uuid)
       GROUP BY g.id, g.branch_id, g.confirmed_at, g.created_at
      HAVING SUM(i.quantity * i.unit_cost) > 0
       ORDER BY 3 LIMIT ${limit}`.execute(db);
    for (const r of rows) push("goods_receipt_ap", "goods_receipt", r, "استلام مؤكد لمورد ومفيهوش قيد مخزون/دائنون");
  }

  if (kinds.has("payroll_posting") && !branch) {
    const { rows } = await sql<{ id: string; branch_id: null; at: Date; amount: string }>`
      SELECT p.id::text AS id, NULL AS branch_id, COALESCE(p.approved_at, p.created_at) AS at, p.total_net_pay AS amount
        FROM payroll_runs p
       WHERE p.status = 'APPROVED' AND p.legacy_payroll_run_id IS NULL AND p.total_net_pay > 0
         AND NOT EXISTS (SELECT 1 FROM journal_entries j WHERE j.source_type = 'payroll_run' AND j.source_id = p.id::text)
       ORDER BY 3 LIMIT ${limit}`.execute(db);
    for (const r of rows) push("payroll_posting", "payroll_run", r, "قائمة رواتب معتمدة ومفيهاش قيد رواتب");
  }

  if (kinds.has("payroll_cancellation_unreversed") && !branch) {
    const { rows } = await sql<{ id: string; branch_id: null; at: Date; amount: string }>`
      SELECT p.id::text AS id, NULL AS branch_id, COALESCE(p.cancelled_at, p.created_at) AS at, p.total_net_pay AS amount
        FROM payroll_runs p
        JOIN journal_entries j ON j.source_type = 'payroll_run' AND j.source_id = p.id::text AND j.status = 'POSTED'
       WHERE p.status = 'CANCELLED'
       ORDER BY 3 LIMIT ${limit}`.execute(db);
    for (const r of rows) push("payroll_cancellation_unreversed", "payroll_run", r, "قائمة رواتب ملغاة وقيدها لسه مش معكوس");
  }

  if (kinds.has("payment_adjustment")) {
    const { rows } = await sql<{ id: string; branch_id: string | null; at: Date; amount: string }>`
      SELECT par.id::text AS id, p.branch_id::text AS branch_id, COALESCE(par.decided_at, par.requested_at) AS at, (par.proposed_amount - par.previous_amount) AS amount
        FROM payment_adjustment_requests par
        JOIN payments p ON p.id = par.payment_id
       WHERE par.status = 'APPROVED' AND par.previous_amount IS NOT NULL
         AND ABS(par.proposed_amount - par.previous_amount) >= 0.005
         AND NOT EXISTS (SELECT 1 FROM journal_entries j WHERE j.source_type = 'payment_adjustment' AND j.source_id = par.id::text)
         AND (${branch}::uuid IS NULL OR p.branch_id = ${branch}::uuid)
       ORDER BY 3 LIMIT ${limit}`.execute(db);
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

export async function checkChartOfAccounts(db: Kysely<Database>): Promise<{ code: string; purpose: string; present: boolean }[]> {
  const { rows } = await sql<{ code: string }>`SELECT code FROM accounts WHERE code = ANY(${REQUIRED_ACCOUNTS.map((a) => a.code)}::text[])`.execute(db);
  const present = new Set(rows.map((r) => r.code));
  return REQUIRED_ACCOUNTS.map((a) => ({ ...a, present: present.has(a.code) }));
}
