import { Inject, Injectable } from "@nestjs/common";
import { count, desc, eq } from "drizzle-orm";
import { paginate, totalOf } from "../../../../shared/database/pagination";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import {
  TalabatIntegrationError,
  type IntegrationErrorStage,
  type IntegrationErrorStatus,
} from "../../domain/talabat-integration-error.aggregate";
import type { TalabatIntegrationErrorRepositoryPort } from "../../domain/ports/talabat-integration-error-repository.port";
import { talabatIntegrationErrors } from "./talabat.tables";

@Injectable()
export class TalabatIntegrationErrorRepository implements TalabatIntegrationErrorRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(error: TalabatIntegrationError): Promise<void> {
    const row = this.toRow(error);
    await this.db
      .insert(talabatIntegrationErrors)
      .values(row)
      .onConflictDoUpdate({
        target: talabatIntegrationErrors.id,
        set: {
          message: row.message,
          context: row.context,
          retry_count: row.retry_count,
          last_retry_at: row.last_retry_at,
          status: row.status,
          updated_at: row.updated_at,
        },
      });
  }

  async findById(id: string): Promise<TalabatIntegrationError | null> {
    const [row] = await this.db.select().from(talabatIntegrationErrors).where(eq(talabatIntegrationErrors.id, id)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async list(filter?: { status?: string }): Promise<TalabatIntegrationError[]> {
    return (await this.listPage(filter)).rows;
  }

  async listPage(filter?: { status?: string }, page?: PageRequest): Promise<{ rows: TalabatIntegrationError[]; total: number }> {
    const where = filter?.status ? eq(talabatIntegrationErrors.status, filter.status) : undefined;
    const query = this.db.select().from(talabatIntegrationErrors).where(where).orderBy(desc(talabatIntegrationErrors.created_at), desc(talabatIntegrationErrors.id)).$dynamic();
    const { rows, total } = await paginate(query, page, async () => totalOf(await this.db.select({ total: count() }).from(talabatIntegrationErrors).where(where)));
    return { rows: rows.map((r) => this.toDomain(r)), total };
  }

  // context is jsonb: Drizzle serialises it.
  private toRow(error: TalabatIntegrationError): typeof talabatIntegrationErrors.$inferInsert {
    return {
      id: error.id,
      stage: error.stage,
      talabat_order_id: error.talabatOrderId,
      message: error.message,
      context: error.context,
      retry_count: error.retryCount,
      last_retry_at: error.lastRetryAt,
      status: error.status,
      created_at: error.createdAt,
      updated_at: error.updatedAt,
    };
  }

  private toDomain(row: typeof talabatIntegrationErrors.$inferSelect): TalabatIntegrationError {
    return TalabatIntegrationError.reconstitute(row.id, {
      stage: row.stage as IntegrationErrorStage,
      talabatOrderId: row.talabat_order_id,
      message: row.message,
      context: (typeof row.context === "string" ? JSON.parse(row.context) : row.context) as Record<string, unknown> | null,
      retryCount: row.retry_count,
      lastRetryAt: row.last_retry_at,
      status: row.status as IntegrationErrorStatus,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }
}
