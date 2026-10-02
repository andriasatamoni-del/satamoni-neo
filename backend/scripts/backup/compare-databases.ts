// BL-13: compares a SOURCE database with a RESTORED copy on critical business data (row counts, ledger totals,
// inventory balances, users/roles, audit trail, applied migrations). Used by the restore drill and by tests.
//
// exact mode            -> every metric must be identical (scratch/test sources that nobody is writing to)
// tolerateSourceGrowth  -> for a LIVE source that kept receiving writes after the dump snapshot: append-only
//                          counts may be greater in the source, never smaller, and migrations/roles must match.
import { Client } from "pg";

export interface Metric { name: string; sql: string; appendOnly?: boolean; mustMatchAlways?: boolean }

export const CRITICAL_METRICS: Metric[] = [
  { name: "tables", sql: "SELECT count(*)::text v FROM information_schema.tables WHERE table_schema='public'", mustMatchAlways: true },
  { name: "migrations", sql: "SELECT count(*)::text v FROM kysely_migration", mustMatchAlways: true },
  { name: "users", sql: "SELECT count(*)::text v FROM users", appendOnly: true },
  { name: "user_roles", sql: "SELECT coalesce(string_agg(DISTINCT role, ',' ORDER BY role),'') v FROM users", mustMatchAlways: false },
  { name: "branches", sql: "SELECT count(*)::text v FROM branches", appendOnly: true },
  { name: "orders", sql: "SELECT count(*)::text v FROM orders", appendOnly: true },
  { name: "payments", sql: "SELECT count(*)::text v FROM payments", appendOnly: true },
  { name: "journal_entries", sql: "SELECT count(*)::text v FROM journal_entries", appendOnly: true },
  { name: "journal_lines", sql: "SELECT count(*)::text v FROM journal_entry_lines", appendOnly: true },
  { name: "journal_debit_equals_credit", sql: "SELECT (round(coalesce(sum(debit),0)::numeric,2) = round(coalesce(sum(credit),0)::numeric,2))::text v FROM journal_entry_lines", mustMatchAlways: true },
  { name: "stock_movements", sql: "SELECT count(*)::text v FROM stock_movements", appendOnly: true },
  { name: "stock_balance_equals_movements", sql: "SELECT (round(coalesce((SELECT sum(quantity) FROM branch_stock_balances),0)::numeric,3) = round(coalesce((SELECT sum(quantity_delta) FROM stock_movements),0)::numeric,3))::text v", mustMatchAlways: true },
  { name: "inventory_items", sql: "SELECT count(*)::text v FROM inventory_items", appendOnly: true },
  { name: "payroll_runs", sql: "SELECT count(*)::text v FROM payroll_runs", appendOnly: true },
  { name: "goods_receipts", sql: "SELECT count(*)::text v FROM goods_receipts", appendOnly: true },
  { name: "audit_logs", sql: "SELECT count(*)::text v FROM audit_logs", appendOnly: true },
];

export const EXACT_ONLY_METRICS: Metric[] = [
  { name: "journal_total_debit", sql: "SELECT round(coalesce(sum(debit),0)::numeric,2)::text v FROM journal_entry_lines" },
  { name: "stock_balance_total", sql: "SELECT round(coalesce(sum(quantity),0)::numeric,3)::text v FROM branch_stock_balances" },
  { name: "payments_total", sql: "SELECT round(coalesce(sum(amount),0)::numeric,2)::text v FROM payments" },
  { name: "orders_total", sql: "SELECT round(coalesce(sum(total),0)::numeric,2)::text v FROM orders" },
];

export interface ComparisonRow { metric: string; source: string; restored: string; ok: boolean }

async function scalar(client: Client, sql: string): Promise<string> {
  return (await client.query(sql)).rows[0].v as string;
}

export async function compareDatabases(
  sourceUrl: string,
  restoredUrl: string,
  opts: { tolerateSourceGrowth?: boolean } = {}
): Promise<{ ok: boolean; rows: ComparisonRow[] }> {
  // only the SOURCE (managed, remote) database needs TLS; the restored copy is a local throw-away server
  const src = new Client({ connectionString: sourceUrl, ssl: process.env.RESTORE_DRILL_SOURCE_SSL === "true" ? { rejectUnauthorized: false } : undefined });
  const dst = new Client({ connectionString: restoredUrl });
  await src.connect();
  await dst.connect();
  try {
    const rows: ComparisonRow[] = [];
    const metrics = opts.tolerateSourceGrowth ? CRITICAL_METRICS : [...CRITICAL_METRICS, ...EXACT_ONLY_METRICS];
    for (const m of metrics) {
      const s = await scalar(src, m.sql);
      const d = await scalar(dst, m.sql);
      let ok = s === d;
      if (!ok && opts.tolerateSourceGrowth && m.appendOnly) ok = Number(d) <= Number(s);
      rows.push({ metric: m.name, source: s, restored: d, ok });
    }
    return { ok: rows.every((r) => r.ok), rows };
  } finally {
    await src.end();
    await dst.end();
  }
}
