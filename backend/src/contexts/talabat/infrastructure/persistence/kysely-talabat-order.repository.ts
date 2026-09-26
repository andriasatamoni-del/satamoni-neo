import { Inject, Injectable } from "@nestjs/common";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { TalabatOrder, type CancellationSource, type TalabatOrderStatus } from "../../domain/talabat-order.aggregate";
import type { TalabatOrderRepositoryPort } from "../../domain/ports/talabat-order-repository.port";
import type { TalabatOrdersTable } from "./talabat.schema";

@Injectable()
export class KyselyTalabatOrderRepository implements TalabatOrderRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async save(order: TalabatOrder): Promise<void> {
    const row = this.toRow(order);
    await this.db
      .insertInto("talabat_orders")
      .values(row)
      .onConflict((oc) =>
        oc.column("id").doUpdateSet({
          branch_id: row.branch_id,
          pos_order_id: row.pos_order_id,
          status: row.status,
          error_reason: row.error_reason,
          canceled_at: row.canceled_at,
          cancellation_source: row.cancellation_source,
          updated_at: row.updated_at,
        })
      )
      .execute();
  }

  async findById(id: string): Promise<TalabatOrder | null> {
    const row = await this.db.selectFrom("talabat_orders").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async findByTalabatOrderId(talabatOrderId: string): Promise<TalabatOrder | null> {
    const row = await this.db.selectFrom("talabat_orders").selectAll().where("talabat_order_id", "=", talabatOrderId).executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async list(filter?: { branchId?: string; status?: string; from?: Date; to?: Date }): Promise<TalabatOrder[]> {
    let query = this.db.selectFrom("talabat_orders").selectAll();
    if (filter?.branchId) query = query.where("branch_id", "=", filter.branchId);
    if (filter?.status) query = query.where("status", "=", filter.status);
    if (filter?.from) query = query.where("created_at", ">=", filter.from);
    if (filter?.to) query = query.where("created_at", "<=", filter.to);
    const rows = await query.orderBy("created_at", "desc").execute();
    return rows.map((r) => this.toDomain(r));
  }

  private toRow(order: TalabatOrder) {
    return {
      id: order.id,
      talabat_order_id: order.talabatOrderId,
      branch_id: order.branchId,
      pos_order_id: order.posOrderId,
      status: order.status,
      raw_payload: JSON.stringify(order.rawPayload),
      error_reason: order.errorReason,
      canceled_at: order.canceledAt,
      cancellation_source: order.cancellationSource,
      created_at: order.createdAt,
      updated_at: order.updatedAt,
    };
  }

  private toDomain(row: Selectable<TalabatOrdersTable>): TalabatOrder {
    return TalabatOrder.reconstitute(row.id, {
      talabatOrderId: row.talabat_order_id,
      branchId: row.branch_id,
      posOrderId: row.pos_order_id,
      status: row.status as TalabatOrderStatus,
      rawPayload: typeof row.raw_payload === "string" ? JSON.parse(row.raw_payload) : row.raw_payload,
      errorReason: row.error_reason,
      canceledAt: row.canceled_at,
      cancellationSource: row.cancellation_source as CancellationSource | null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }
}
