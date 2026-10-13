import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { PaymentAdjustmentRequest, type AdjustmentRequestStatus } from "../../domain/payment-adjustment-request.aggregate";
import type { PaymentAdjustmentRequestRepositoryPort } from "../../domain/ports/payment-adjustment-request-repository.port";
import { paymentAdjustmentRequests } from "./payment-control.tables";

@Injectable()
export class PaymentAdjustmentRequestRepository implements PaymentAdjustmentRequestRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(request: PaymentAdjustmentRequest): Promise<void> {
    const row = this.toRow(request);
    await this.db
      .insert(paymentAdjustmentRequests)
      .values(row)
      .onConflictDoUpdate({
        target: paymentAdjustmentRequests.id,
        set: {
          reason: row.reason,
          proposed_payment_method_id: row.proposed_payment_method_id,
          proposed_amount: row.proposed_amount,
          amount_delta: row.amount_delta,
          status: row.status,
          decided_by: row.decided_by,
          decided_at: row.decided_at,
          previous_payment_method_id: row.previous_payment_method_id,
          previous_amount: row.previous_amount,
        },
      });
  }

  async findById(id: string): Promise<PaymentAdjustmentRequest | null> {
    const [row] = await this.db.select().from(paymentAdjustmentRequests).where(eq(paymentAdjustmentRequests.id, id)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async findByLegacyAdjustmentRequestId(legacyId: number): Promise<PaymentAdjustmentRequest | null> {
    const [row] = await this.db
      .select()
      .from(paymentAdjustmentRequests)
      .where(eq(paymentAdjustmentRequests.legacy_adjustment_request_id, legacyId))
      .limit(1);
    return row ? this.toDomain(row) : null;
  }

  async list(filter?: { paymentId?: string; status?: string }): Promise<PaymentAdjustmentRequest[]> {
    const rows = await this.db
      .select()
      .from(paymentAdjustmentRequests)
      .where(
        and(
          filter?.paymentId ? eq(paymentAdjustmentRequests.payment_id, filter.paymentId) : undefined,
          filter?.status ? eq(paymentAdjustmentRequests.status, filter.status) : undefined
        )
      )
      .orderBy(desc(paymentAdjustmentRequests.requested_at));
    return rows.map((r) => this.toDomain(r));
  }

  private toRow(request: PaymentAdjustmentRequest) {
    return {
      id: request.id,
      payment_id: request.paymentId,
      requested_by: request.requestedBy,
      requested_at: request.requestedAt,
      reason: request.reason,
      proposed_payment_method_id: request.proposedPaymentMethodId,
      proposed_amount: request.proposedAmount,
      amount_delta: request.amountDelta,
      status: request.status,
      decided_by: request.decidedBy,
      decided_at: request.decidedAt,
      legacy_adjustment_request_id: request.legacyAdjustmentRequestId,
      previous_payment_method_id: request.previousPaymentMethodId,
      previous_amount: request.previousAmount,
    };
  }

  private toDomain(row: typeof paymentAdjustmentRequests.$inferSelect): PaymentAdjustmentRequest {
    return PaymentAdjustmentRequest.reconstitute(row.id, {
      paymentId: row.payment_id,
      requestedBy: row.requested_by,
      requestedAt: row.requested_at,
      reason: row.reason,
      proposedPaymentMethodId: row.proposed_payment_method_id,
      proposedAmount: Number(row.proposed_amount),
      amountDelta: Number(row.amount_delta),
      status: row.status as AdjustmentRequestStatus,
      decidedBy: row.decided_by,
      decidedAt: row.decided_at,
      legacyAdjustmentRequestId: row.legacy_adjustment_request_id,
      previousPaymentMethodId: row.previous_payment_method_id,
      previousAmount: row.previous_amount !== null ? Number(row.previous_amount) : null,
    });
  }
}
