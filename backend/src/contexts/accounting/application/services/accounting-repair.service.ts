import { Inject, Injectable } from "@nestjs/common";
import { sql } from "kysely";
import type { Kysely } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/kysely.token";
import { TransactionService } from "../../../../shared/database/transaction-context";
import { AuditLogService } from "../../../../shared/audit/audit-log.service";
import { businessDate } from "../../../../shared/time/business-date";
import { findJournalGaps, checkChartOfAccounts, ALL_GAP_KINDS, type GapKind, type JournalGap } from "../../infrastructure/persistence/journal-coverage";
import { AccountingPostingService, accountingEnforcement } from "./accounting-posting.service";
import { PostOrderSaleJournalEntryHandler } from "../commands/post-order-sale-journal-entry.handler";
import { PostOrderCogsJournalEntryHandler } from "../commands/post-order-cogs-journal-entry.handler";
import { PostGoodsReceiptApJournalEntryHandler } from "../commands/post-goods-receipt-ap-journal-entry.handler";
import { PostPayrollJournalEntryHandler } from "../commands/post-payroll-journal-entry.handler";
import { PostPaymentAdjustmentJournalEntryHandler } from "../commands/post-payment-adjustment-journal-entry.handler";
import { OrderRegisteredEvent } from "../../../orders/domain/events/order-registered.event";
import { GoodsReceiptConfirmedEvent } from "../../../procurement/domain/events/goods-receipt-confirmed.event";
import { PayrollRunApprovedEvent } from "../../../hr-payroll/domain/events/payroll-run-approved.event";
import { PaymentAdjustmentApprovedEvent } from "../../../payment-control/domain/events/payment-adjustment-approved.event";

export type RepairOutcome = "POSTED" | "REVERSED" | "SKIPPED" | "FAILED";
export interface RepairResult {
  kind: GapKind;
  sourceId: string;
  outcome: RepairOutcome;
  reason?: string;
}

// Phase 3.1 (BL-08): safe, authorised, idempotent repair of missing journals for eligible historical transactions.
//  * Idempotent: every posting goes through AccountingPostingService.postOnce / reverseBySource (one journal per source; DB unique index
//    as the last line of defence), so running it twice - or racing with the normal flow - can never double post.
//  * Dated on the ORIGINAL Cairo business date of the transaction, never "today"; if that accounting period is closed the item FAILS with
//    an explicit reason instead of silently posting into another period.
//  * Strict about accounts even when the system runs in "deferred" mode: a still-missing account is reported, never skipped silently.
//  * Each item is its own savepoint (one failure never blocks the rest) and writes its own audit row (ACCOUNTING_REPAIR) with the outcome.
@Injectable()
export class AccountingRepairService {
  constructor(
    @Inject(KYSELY) private readonly db: Kysely<Database>,
    private readonly tx: TransactionService,
    private readonly audit: AuditLogService,
    private readonly posting: AccountingPostingService,
    private readonly postSale: PostOrderSaleJournalEntryHandler,
    private readonly postCogs: PostOrderCogsJournalEntryHandler,
    private readonly postGrn: PostGoodsReceiptApJournalEntryHandler,
    private readonly postPayroll: PostPayrollJournalEntryHandler,
    private readonly postAdjustment: PostPaymentAdjustmentJournalEntryHandler
  ) {}

  async readiness() {
    const accounts = await checkChartOfAccounts(this.db);
    const missing = accounts.filter((a) => !a.present);
    return { enforcement: accountingEnforcement(), ready: missing.length === 0, accounts, missing: missing.map((a) => a.code) };
  }

  async coverage(filter: { branchId?: string | null; kinds?: GapKind[]; limit?: number } = {}) {
    const gaps = await findJournalGaps(this.db, filter);
    const byKind: Record<string, number> = {};
    for (const g of gaps) byKind[g.kind] = (byKind[g.kind] ?? 0) + 1;
    return { total: gaps.length, byKind, gaps };
  }

  // Dated duplicates / UTC-vs-Cairo date drift of automatically posted journals (historical records are reported, never rewritten)
  async businessDateDrift(limit = 200) {
    const { rows } = await sql<{ id: string; entry_number: string; source_type: string; source_id: string; entry_date: Date; cairo_date: Date }>`
      SELECT id::text, entry_number, source_type, source_id, entry_date, (created_at AT TIME ZONE 'Africa/Cairo')::date AS cairo_date
        FROM journal_entries
       WHERE source_type IN ('order_sale','order_cogs','goods_receipt','payroll_run','payment_adjustment','purchase','cash_drawer_entry','shift_variance')
         AND entry_date <> (created_at AT TIME ZONE 'Africa/Cairo')::date
       ORDER BY created_at DESC LIMIT ${limit}`.execute(this.db);
    return rows.map((r) => ({
      journalEntryId: r.id,
      entryNumber: r.entry_number,
      sourceType: r.source_type,
      sourceId: r.source_id,
      recordedEntryDate: r.entry_date.toISOString().slice(0, 10),
      cairoBusinessDate: r.cairo_date.toISOString().slice(0, 10),
    }));
  }

  async repair(input: { kinds?: GapKind[]; sourceIds?: string[]; limit?: number; actorUserId: string | null }) {
    const kinds = (input.kinds?.length ? input.kinds : ALL_GAP_KINDS).filter((k) => ALL_GAP_KINDS.includes(k));
    let gaps = await findJournalGaps(this.db, { kinds, limit: input.limit ?? 200 });
    if (input.sourceIds?.length) gaps = gaps.filter((g) => input.sourceIds!.includes(g.sourceId));

    const results: RepairResult[] = [];
    for (const gap of gaps) {
      let result: RepairResult;
      try {
        result = await this.tx.isolated(async () => {
          const r = await this.repairOne(gap, input.actorUserId);
          await this.recordAudit(gap, r, input.actorUserId);
          return r;
        });
      } catch (err) {
        result = { kind: gap.kind, sourceId: gap.sourceId, outcome: "FAILED", reason: err instanceof Error ? err.message : String(err) };
        // the failed attempt is recorded too (its own writes were rolled back to the savepoint)
        await this.recordAudit(gap, result, input.actorUserId).catch(() => undefined);
      }
      results.push(result);
    }
    const count = (o: RepairOutcome) => results.filter((r) => r.outcome === o).length;
    return { attempted: results.length, posted: count("POSTED"), reversed: count("REVERSED"), skipped: count("SKIPPED"), failed: count("FAILED"), results };
  }

  private async recordAudit(gap: JournalGap, r: RepairResult, actor: string | null): Promise<void> {
    await this.audit.record({
      actorUserId: actor,
      action: "ACCOUNTING_REPAIR",
      entityType: gap.sourceType,
      entityId: gap.sourceId,
      branchId: gap.branchId,
      outcome: r.outcome === "FAILED" ? "FAILED" : "SUCCESS",
      metadata: { kind: gap.kind, outcome: r.outcome, reason: r.reason ?? null, businessDate: gap.businessDate, amount: gap.amount },
    });
  }

  private async repairOne(gap: JournalGap, actor: string | null): Promise<RepairResult> {
    const base = { kind: gap.kind, sourceId: gap.sourceId };
    const entryDate = businessDate(gap.occurredAt);

    switch (gap.kind) {
      case "order_sale":
      case "order_cogs": {
        await this.tx.lockRow("orders", gap.sourceId);
        const { rows } = await sql<{ id: string; branch_id: string; total: string; created_by: string | null; payment_method_id: string | null; status: string; cost: string | null; incomplete: boolean }>`
          SELECT o.id::text, o.branch_id::text, o.total, o.created_by::text, o.payment_method_id::text, o.status,
                 (SELECT SUM(m.total_cost) FROM stock_movements m WHERE m.reference_type='order' AND m.reference_id=o.id::text AND m.movement_type='CONSUMPTION') AS cost,
                 EXISTS (SELECT 1 FROM stock_movements m WHERE m.reference_type='order' AND m.reference_id=o.id::text AND m.movement_type='CONSUMPTION' AND m.total_cost IS NULL) AS incomplete
            FROM orders o WHERE o.id = ${gap.sourceId}::uuid`.execute(this.db);
        const o = rows[0];
        if (!o || o.status === "cancelled") return { ...base, outcome: "SKIPPED", reason: "الطلب مش موجود أو ملغي" };
        const event = new OrderRegisteredEvent(o.id, o.branch_id, Number(o.total), o.created_by, o.payment_method_id, Math.round(Number(o.cost ?? 0) * 100) / 100, o.incomplete);
        if (gap.kind === "order_sale") await this.postSale.handle(event, { entryDate });
        else await this.postCogs.handle(event, { entryDate });
        return this.verifyPosted(base, gap.sourceType, gap.sourceId);
      }
      case "order_cancellation_unreversed": {
        await this.tx.lockRow("orders", gap.sourceId);
        const outcome = await this.posting.reverseBySource(gap.sourceType, gap.sourceId, actor, `إصلاح: عكس قيد طلب ملغي ${gap.sourceId}`);
        return { ...base, outcome: outcome === "reversed" ? "REVERSED" : "SKIPPED", reason: outcome === "reversed" ? undefined : outcome };
      }
      case "goods_receipt_ap": {
        await this.tx.lockRow("goods_receipts", gap.sourceId);
        const { rows } = await sql<{ id: string; branch_id: string; supplier_id: string; received_by: string | null; total: string }>`
          SELECT g.id::text, g.branch_id::text, g.supplier_id::text, g.received_by::text, (SELECT SUM(i.quantity*i.unit_cost) FROM goods_receipt_items i WHERE i.goods_receipt_id=g.id) AS total
            FROM goods_receipts g WHERE g.id = ${gap.sourceId}::uuid AND g.status='CONFIRMED'`.execute(this.db);
        const g = rows[0];
        if (!g) return { ...base, outcome: "SKIPPED", reason: "الاستلام مش مؤكد أو مش موجود" };
        await this.postGrn.handle(new GoodsReceiptConfirmedEvent(g.id, g.branch_id, g.supplier_id, Number(g.total), g.received_by), { entryDate });
        return this.verifyPosted(base, "goods_receipt", gap.sourceId);
      }
      case "payroll_posting": {
        await this.tx.lockRow("payroll_runs", gap.sourceId);
        const { rows } = await sql<{ id: string; year: number; month: number; total_net_pay: string; approved_by: string | null }>`
          SELECT id::text, year, month, total_net_pay, approved_by::text FROM payroll_runs WHERE id = ${gap.sourceId}::uuid AND status = 'APPROVED'`.execute(this.db);
        const p = rows[0];
        if (!p) return { ...base, outcome: "SKIPPED", reason: "القائمة مش معتمدة" };
        await this.postPayroll.handle(new PayrollRunApprovedEvent(p.id, p.year, p.month, Number(p.total_net_pay), p.approved_by), { entryDate });
        return this.verifyPosted(base, "payroll_run", gap.sourceId);
      }
      case "payroll_cancellation_unreversed": {
        await this.tx.lockRow("payroll_runs", gap.sourceId);
        const outcome = await this.posting.reverseBySource("payroll_run", gap.sourceId, actor, `إصلاح: عكس قيد قائمة رواتب ملغاة ${gap.sourceId}`);
        return { ...base, outcome: outcome === "reversed" ? "REVERSED" : "SKIPPED", reason: outcome === "reversed" ? undefined : outcome };
      }
      case "payment_adjustment": {
        await this.tx.lockRow("payment_adjustment_requests", gap.sourceId);
        const { rows } = await sql<{ id: string; payment_id: string; order_id: string; branch_id: string; prev_amount: string; new_amount: string; prev_method: string; new_method: string; decided_by: string | null }>`
          SELECT par.id::text, par.payment_id::text, p.order_id::text, p.branch_id::text, par.previous_amount AS prev_amount, par.proposed_amount AS new_amount,
                 COALESCE(par.previous_payment_method_id, p.payment_method_id)::text AS prev_method, p.payment_method_id::text AS new_method, par.decided_by::text
            FROM payment_adjustment_requests par JOIN payments p ON p.id = par.payment_id
           WHERE par.id = ${gap.sourceId}::uuid AND par.status = 'APPROVED'`.execute(this.db);
        const a = rows[0];
        if (!a) return { ...base, outcome: "SKIPPED", reason: "التعديل مش معتمد" };
        await this.postAdjustment.handle(
          new PaymentAdjustmentApprovedEvent(a.id, a.payment_id, a.order_id, a.branch_id, Number(a.prev_amount), Number(a.new_amount), a.prev_method, a.new_method, a.decided_by),
          { entryDate }
        );
        return this.verifyPosted(base, "payment_adjustment", gap.sourceId);
      }
    }
  }

  // The handlers are no-ops in deferred mode when accounts are missing: confirm the journal really exists before claiming success
  private async verifyPosted(base: { kind: GapKind; sourceId: string }, sourceType: string, sourceId: string): Promise<RepairResult> {
    const { rows } = await sql<{ n: string }>`SELECT count(*)::text AS n FROM journal_entries WHERE source_type = ${sourceType} AND source_id = ${sourceId}`.execute(this.db);
    if (Number(rows[0].n) > 0) return { ...base, outcome: "POSTED" };
    return { ...base, outcome: "FAILED", reason: "لسه فيه حسابات ناقصة في دليل الحسابات - اضبط الدليل الأول (راجع /accounting/readiness)" };
  }
}
