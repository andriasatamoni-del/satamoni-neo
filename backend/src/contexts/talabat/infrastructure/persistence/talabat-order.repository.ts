import { Inject, Injectable } from "@nestjs/common";
import { and, count, desc, eq, gte, lte } from "drizzle-orm";
import { paginate, totalOf } from "../../../../shared/database/pagination";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { TalabatOrder, type CancellationSource, type TalabatOrderStatus } from "../../domain/talabat-order.aggregate";
import type { TalabatOrderRepositoryPort } from "../../domain/ports/talabat-order-repository.port";
import { talabatOrders } from "./talabat.tables";

@Injectable()
export class TalabatOrderRepository implements TalabatOrderRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(order: TalabatOrder): Promise<void> {
    const row = this.toRow(order);
    await this.db
      .insert(talabatOrders)
      .values(row)
      .onConflictDoUpdate({
        target: talabatOrders.id,
        set: {
          branch_id: row.branch_id,
          pos_order_id: row.pos_order_id,
          status: row.status,
          error_reason: row.error_reason,
          canceled_at: row.canceled_at,
          cancellation_source: row.cancellation_source,
          updated_at: row.updated_at,
        },
      });
  }

  async findById(id: string): Promise<TalabatOrder | null> {
    const [row] = await this.db.select().from(talabatOrders).where(eq(talabatOrders.id, id)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async findByTalabatOrderId(talabatOrderId: string): Promise<TalabatOrder | null> {
    const [row] = await this.db.select().from(talabatOrders).where(eq(talabatOrders.talabat_order_id, talabatOrderId)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async list(filter?: { branchId?: string; status?: string; from?: Date; to?: Date }): Promise<TalabatOrder[]> {
    return (await this.listPage(filter)).rows;
  }

  async listPage(filter?: { branchId?: string; status?: string; from?: Date; to?: Date }, page?: PageRequest): Promise<{ rows: TalabatOrder[]; total: number }> {
    const where = and(
      filter?.branchId ? eq(talabatOrders.branch_id, filter.branchId) : undefined,
      filter?.status ? eq(talabatOrders.status, filter.status) : undefined,
      filter?.from ? gte(talabatOrders.created_at, filter.from) : undefined,
      filter?.to ? lte(talabatOrders.created_at, filter.to) : undefined
    );
    const query = this.db.select().from(talabatOrders).where(where).orderBy(desc(talabatOrders.created_at), desc(talabatOrders.id)).$dynamic();
    const { rows, total } = await paginate(query, page, async () => totalOf(await this.db.select({ total: count() }).from(talabatOrders).where(where)));
    return { rows: rows.map((r) => this.toDomain(r)), total };
  }

  // raw_payload is jsonb: Drizzle serialises it.
  private toRow(order: TalabatOrder): typeof talabatOrders.$inferInsert {
    return {
      id: order.id,
      talabat_order_id: order.talabatOrderId,
      branch_id: order.branchId,
      pos_order_id: order.posOrderId,
      status: order.status,
      raw_payload: order.rawPayload,
      error_reason: order.errorReason,
      canceled_at: order.canceledAt,
      cancellation_source: order.cancellationSource,
      created_at: order.createdAt,
      updated_at: order.updatedAt,
    };
  }

  private toDomain(row: typeof talabatOrders.$inferSelect): TalabatOrder {
    return TalabatOrder.reconstitute(row.id, {
      talabatOrderId: row.talabat_order_id,
      branchId: row.branch_id,
      posOrderId: row.pos_order_id,
      status: row.status as TalabatOrderStatus,
      rawPayload: (typeof row.raw_payload === "string" ? JSON.parse(row.raw_payload) : row.raw_payload) as TalabatOrder["rawPayload"],
      errorReason: row.error_reason,
      canceledAt: row.canceled_at,
      cancellationSource: row.cancellation_source as CancellationSource | null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }
}
