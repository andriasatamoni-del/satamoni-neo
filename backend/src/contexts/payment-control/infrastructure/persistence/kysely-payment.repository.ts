import { Inject, Injectable } from "@nestjs/common";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { Payment } from "../../domain/payment.aggregate";
import type { PaymentMethodKind, SettlementChannel } from "../../domain/payment-method.aggregate";
import type { PaymentRepositoryPort } from "../../domain/ports/payment-repository.port";
import type { PaymentsTable } from "./payment-control.schema";

@Injectable()
export class KyselyPaymentRepository implements PaymentRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  // onConflict بيغطي تحديث applyAdjustment() كمان (طريقة/كود/قناة/مبلغ) - التحديث الوحيد المسموح
  // بيه على Payment مقفولة، وبيحصل بس من ApprovePaymentAdjustmentHandler
  async save(payment: Payment): Promise<void> {
    const row = this.toRow(payment);
    await this.db
      .insertInto("payments")
      .values(row)
      .onConflict((oc) =>
        oc.column("id").doUpdateSet({
          payment_method_id: row.payment_method_id,
          method_kind: row.method_kind,
          settlement_channel: row.settlement_channel,
          amount: row.amount,
        })
      )
      .execute();
  }

  async findById(id: string): Promise<Payment | null> {
    const row = await this.db.selectFrom("payments").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async findByOrderId(orderId: string): Promise<Payment | null> {
    const row = await this.db.selectFrom("payments").selectAll().where("order_id", "=", orderId).executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async findByLegacyPaymentId(legacyId: number): Promise<Payment | null> {
    const row = await this.db.selectFrom("payments").selectAll().where("legacy_payment_id", "=", legacyId).executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async list(filter?: { branchId?: string; settlementChannel?: string; fromDate?: Date; toDate?: Date }): Promise<Payment[]> {
    let query = this.db.selectFrom("payments").selectAll();
    if (filter?.branchId) query = query.where("branch_id", "=", filter.branchId);
    if (filter?.settlementChannel) query = query.where("settlement_channel", "=", filter.settlementChannel);
    if (filter?.fromDate) query = query.where("locked_at", ">=", filter.fromDate);
    if (filter?.toDate) query = query.where("locked_at", "<=", filter.toDate);
    const rows = await query.orderBy("locked_at", "desc").execute();
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

  private toDomain(row: Selectable<PaymentsTable>): Payment {
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
