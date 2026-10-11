import { Inject, Injectable } from "@nestjs/common";
import { and, count, desc, eq, exists, inArray, isNull, ne, sql } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { TransactionService } from "../../../../shared/database/transaction-context";
import { AuditLogService } from "../../../../shared/audit/audit-log.service";
import { businessDate } from "../../../../shared/time/business-date";
import { goodsReceiptItems, goodsReceipts } from "../../../procurement/infrastructure/persistence/procurement.tables";
import { orders } from "../../../orders/infrastructure/persistence/orders.tables";
import { stockMovements } from "../../../inventory/infrastructure/persistence/inventory.tables";
import { payrollRuns } from "../../../hr-payroll/infrastructure/persistence/hr-payroll.tables";
import { paymentAdjustmentRequests, payments } from "../../../payment-control/infrastructure/persistence/payment-control.tables";
import { journalEntries } from "../../infrastructure/persistence/accounting.tables";
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

const AUTO_SOURCE_TYPES = ["order_sale", "order_cogs", "goods_receipt", "payroll_run", "payment_adjustment", "purchase", "cash_drawer_entry", "shift_variance"];

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
    @Inject(DATABASE) private readonly db: Database,
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
    // mapped through entry_date so the Cairo date comes back exactly like the column does
    const cairoDate = sql<Date>`(${journalEntries.created_at} AT TIME ZONE 'Africa/Cairo')::date`.mapWith(journalEntries.entry_date);
    const rows = await this.db
      .select({
        id: journalEntries.id,
        entry_number: journalEntries.entry_number,
        source_type: journalEntries.source_type,
        source_id: journalEntries.source_id,
        entry_date: journalEntries.entry_date,
        cairo_date: cairoDate,
      })
      .from(journalEntries)
      .where(and(inArray(journalEntries.source_type, AUTO_SOURCE_TYPES), ne(journalEntries.entry_date, cairoDate)))
      .orderBy(desc(journalEntries.created_at))
      .limit(limit);
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
    const countOf = (o: RepairOutcome) => results.filter((r) => r.outcome === o).length;
    return {
      attempted: results.length,
      posted: countOf("POSTED"),
      reversed: countOf("REVERSED"),
      skipped: countOf("SKIPPED"),
      failed: countOf("FAILED"),
      results,
    };
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
        const consumption = and(
          eq(stockMovements.reference_type, "order"),
          eq(stockMovements.reference_id, sql`${orders.id}::text`),
          eq(stockMovements.movement_type, "CONSUMPTION")
        );
        const [o] = await this.db
          .select({
            id: orders.id,
            branch_id: orders.branch_id,
            total: orders.total,
            created_by: orders.created_by,
            payment_method_id: orders.payment_method_id,
            status: orders.status,
            cost: sql<string | null>`(${this.db.select({ total: sql`SUM(${stockMovements.total_cost})` }).from(stockMovements).where(consumption)})`,
            incomplete: exists(this.db.select({ one: sql`1` }).from(stockMovements).where(and(consumption, isNull(stockMovements.total_cost)))).mapWith(Boolean),
          })
          .from(orders)
          .where(eq(orders.id, gap.sourceId));
        if (!o || o.status === "cancelled") return { ...base, outcome: "SKIPPED", reason: "الطلب مش موجود أو ملغي" };
        const event = new OrderRegisteredEvent(
          o.id,
          o.branch_id,
          Number(o.total),
          o.created_by,
          o.payment_method_id,
          Math.round(Number(o.cost ?? 0) * 100) / 100,
          o.incomplete
        );
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
        const [g] = await this.db
          .select({
            id: goodsReceipts.id,
            branch_id: goodsReceipts.branch_id,
            supplier_id: goodsReceipts.supplier_id,
            received_by: goodsReceipts.received_by,
            total: sql<string>`(${this.db
              .select({ total: sql`SUM(${goodsReceiptItems.quantity} * ${goodsReceiptItems.unit_cost})` })
              .from(goodsReceiptItems)
              .where(eq(goodsReceiptItems.goods_receipt_id, goodsReceipts.id))})`,
          })
          .from(goodsReceipts)
          .where(and(eq(goodsReceipts.id, gap.sourceId), eq(goodsReceipts.status, "CONFIRMED")));
        if (!g) return { ...base, outcome: "SKIPPED", reason: "الاستلام مش مؤكد أو مش موجود" };
        await this.postGrn.handle(new GoodsReceiptConfirmedEvent(g.id, g.branch_id, g.supplier_id!, Number(g.total), g.received_by), { entryDate });
        return this.verifyPosted(base, "goods_receipt", gap.sourceId);
      }
      case "payroll_posting": {
        await this.tx.lockRow("payroll_runs", gap.sourceId);
        const [p] = await this.db
          .select({
            id: payrollRuns.id,
            year: payrollRuns.year,
            month: payrollRuns.month,
            total_net_pay: payrollRuns.total_net_pay,
            approved_by: payrollRuns.approved_by,
          })
          .from(payrollRuns)
          .where(and(eq(payrollRuns.id, gap.sourceId), eq(payrollRuns.status, "APPROVED")));
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
        const [a] = await this.db
          .select({
            id: paymentAdjustmentRequests.id,
            payment_id: paymentAdjustmentRequests.payment_id,
            order_id: payments.order_id,
            branch_id: payments.branch_id,
            prev_amount: paymentAdjustmentRequests.previous_amount,
            new_amount: paymentAdjustmentRequests.proposed_amount,
            prev_method: sql<string>`COALESCE(${paymentAdjustmentRequests.previous_payment_method_id}, ${payments.payment_method_id})::text`,
            new_method: payments.payment_method_id,
            decided_by: paymentAdjustmentRequests.decided_by,
          })
          .from(paymentAdjustmentRequests)
          .innerJoin(payments, eq(payments.id, paymentAdjustmentRequests.payment_id))
          .where(and(eq(paymentAdjustmentRequests.id, gap.sourceId), eq(paymentAdjustmentRequests.status, "APPROVED")));
        if (!a) return { ...base, outcome: "SKIPPED", reason: "التعديل مش معتمد" };
        await this.postAdjustment.handle(
          new PaymentAdjustmentApprovedEvent(
            a.id,
            a.payment_id,
            a.order_id,
            a.branch_id,
            Number(a.prev_amount),
            Number(a.new_amount),
            a.prev_method,
            a.new_method,
            a.decided_by
          ),
          { entryDate }
        );
        return this.verifyPosted(base, "payment_adjustment", gap.sourceId);
      }
    }
  }

  // The handlers are no-ops in deferred mode when accounts are missing: confirm the journal really exists before claiming success
  private async verifyPosted(base: { kind: GapKind; sourceId: string }, sourceType: string, sourceId: string): Promise<RepairResult> {
    const [row] = await this.db
      .select({ n: count() })
      .from(journalEntries)
      .where(and(eq(journalEntries.source_type, sourceType), eq(journalEntries.source_id, sourceId)));
    if (row.n > 0) return { ...base, outcome: "POSTED" };
    return { ...base, outcome: "FAILED", reason: "لسه فيه حسابات ناقصة في دليل الحسابات - اضبط الدليل الأول (راجع /accounting/readiness)" };
  }
}
