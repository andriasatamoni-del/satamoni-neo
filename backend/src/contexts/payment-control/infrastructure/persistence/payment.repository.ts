import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { Payment } from "../../domain/payment.aggregate";
import type { PaymentMethodKind, SettlementChannel } from "../../domain/payment-method.aggregate";
import type { PaymentRepositoryPort } from "../../domain/ports/payment-repository.port";
import { payments } from "./payment-control.tables";

@Injectable()
export class PaymentRepository implements PaymentRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  // onConflict بيغطي تحديث applyAdjustment() كمان (طريقة/كود/قناة/مبلغ) - التحديث الوحيد المسموح
  // بيه على Payment مقفولة، وبيحصل بس من ApprovePaymentAdjustmentHandler
  async save(payment: Payment): Promise<void> {
    const row = this.toRow(payment);
    await this.db
      .insert(payments)
      .values(row)
      .onConflictDoUpdate({
        target: payments.id,
        set: {
          payment_method_id: row.payment_method_id,
          method_kind: row.method_kind,
          settlement_channel: row.settlement_channel,
          amount: row.amount,
        },
      });
  }

  async findById(id: string): Promise<Payment | null> {
    const [row] = await this.db.select().from(payments).where(eq(payments.id, id)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async findByOrderId(orderId: string): Promise<Payment | null> {
    const [row] = await this.db.select().from(payments).where(eq(payments.order_id, orderId)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async findByLegacyPaymentId(legacyId: number): Promise<Payment | null> {
    const [row] = await this.db.select().from(payments).where(eq(payments.legacy_payment_id, legacyId)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async list(filter?: { branchId?: string; settlementChannel?: string; fromDate?: Date; toDate?: Date }): Promise<Payment[]> {
    const rows = await this.db
      .select()
      .from(payments)
      .where(
        and(
          filter?.branchId ? eq(payments.branch_id, filter.branchId) : undefined,
          filter?.settlementChannel ? eq(payments.settlement_channel, filter.settlementChannel) : undefined,
          filter?.fromDate ? gte(payments.locked_at, filter.fromDate) : undefined,
          filter?.toDate ? lte(payments.locked_at, filter.toDate) : undefined
        )
      )
      .orderBy(desc(payments.locked_at));
    return rows.map((r) => this.toDomain(r));
  }

  private toRow(payment: Payment) {
    return {
      id: payment.id,
      order_id: payment.orderId,
      branch_id: payment.branchId,
      payment_method_id: payment.paymentMethodId,
      method_kind: payment.methodKind,
      settlement_channel: payment.settlementChannel,
      amount: payment.amount,
      locked_at: payment.lockedAt,
      locked_by: payment.lockedBy,
      legacy_payment_id: payment.legacyPaymentId,
      created_at: payment.createdAt,
    };
  }

  private toDomain(row: typeof payments.$inferSelect): Payment {
    return Payment.reconstitute(row.id, {
      orderId: row.order_id,
      branchId: row.branch_id,
      paymentMethodId: row.payment_method_id,
      methodKind: row.method_kind as PaymentMethodKind,
      settlementChannel: row.settlement_channel as SettlementChannel | null,
      amount: Number(row.amount),
      lockedAt: row.locked_at,
      lockedBy: row.locked_by,
      legacyPaymentId: row.legacy_payment_id,
      createdAt: row.created_at,
    });
  }
}
