import { Inject, Injectable } from "@nestjs/common";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { PaymentAdjustmentRequest, type AdjustmentRequestStatus } from "../../domain/payment-adjustment-request.aggregate";
import type { PaymentAdjustmentRequestRepositoryPort } from "../../domain/ports/payment-adjustment-request-repository.port";
import type { PaymentAdjustmentRequestsTable } from "./payment-control.schema";

@Injectable()
export class KyselyPaymentAdjustmentRequestRepository implements PaymentAdjustmentRequestRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async save(request: PaymentAdjustmentRequest): Promise<void> {
    const row = this.toRow(request);
    await this.db
      .insertInto("payment_adjustment_requests")
      .values(row)
      .onConflict((oc) =>
        oc.column("id").doUpdateSet({
          reason: row.reason,
          proposed_payment_method_id: row.proposed_payment_method_id,
          proposed_amount: row.proposed_amount,
          amount_delta: row.amount_delta,
          status: row.status,
          decided_by: row.decided_by,
          decided_at: row.decided_at,
        })
      )
      .execute();
  }

  async findById(id: string): Promise<PaymentAdjustmentRequest | null> {
    const row = await this.db.selectFrom("payment_adjustment_requests").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async findByLegacyAdjustmentRequestId(legacyId: number): Promise<PaymentAdjustmentRequest | null> {
    const row = await this.db
      .selectFrom("payment_adjustment_requests")
      .selectAll()
      .where("legacy_adjustment_request_id", "=", legacyId)
      .executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async list(filter?: { paymentId?: string; status?: string }): Promise<PaymentAdjustmentRequest[]> {
    let query = this.db.selectFrom("payment_adjustment_requests").selectAll();
    if (filter?.paymentId) query = query.where("payment_id", "=", filter.paymentId);
    if (filter?.status) query = query.where("status", "=", filter.status);
    const rows = await query.orderBy("requested_at", "desc").execute();
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
    };
  }

  private toDomain(row: Selectable<PaymentAdjustmentRequestsTable>): PaymentAdjustmentRequest {
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
    });
  }
}
