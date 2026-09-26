import { Inject, Injectable } from "@nestjs/common";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import {
  TalabatIntegrationError,
  type IntegrationErrorStage,
  type IntegrationErrorStatus,
} from "../../domain/talabat-integration-error.aggregate";
import type { TalabatIntegrationErrorRepositoryPort } from "../../domain/ports/talabat-integration-error-repository.port";
import type { TalabatIntegrationErrorsTable } from "./talabat.schema";

@Injectable()
export class KyselyTalabatIntegrationErrorRepository implements TalabatIntegrationErrorRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async save(error: TalabatIntegrationError): Promise<void> {
    const row = this.toRow(error);
    await this.db
      .insertInto("talabat_integration_errors")
      .values(row)
      .onConflict((oc) =>
        oc.column("id").doUpdateSet({
          message: row.message,
          context: row.context,
          retry_count: row.retry_count,
          last_retry_at: row.last_retry_at,
          status: row.status,
          updated_at: row.updated_at,
        })
      )
      .execute();
  }

  async findById(id: string): Promise<TalabatIntegrationError | null> {
    const row = await this.db.selectFrom("talabat_integration_errors").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async list(filter?: { status?: string }): Promise<TalabatIntegrationError[]> {
    let query = this.db.selectFrom("talabat_integration_errors").selectAll();
    if (filter?.status) query = query.where("status", "=", filter.status);
    const rows = await query.orderBy("created_at", "desc").execute();
    return rows.map((r) => this.toDomain(r));
  }

  private toRow(error: TalabatIntegrationError) {
    return {
      id: error.id,
      stage: error.stage,
      talabat_order_id: error.talabatOrderId,
      message: error.message,
      context: error.context === null ? null : JSON.stringify(error.context),
      retry_count: error.retryCount,
      last_retry_at: error.lastRetryAt,
      status: error.status,
      created_at: error.createdAt,
      updated_at: error.updatedAt,
    };
  }

  private toDomain(row: Selectable<TalabatIntegrationErrorsTable>): TalabatIntegrationError {
    return TalabatIntegrationError.reconstitute(row.id, {
      stage: row.stage as IntegrationErrorStage,
      talabatOrderId: row.talabat_order_id,
      message: row.message,
      context: typeof row.context === "string" ? JSON.parse(row.context) : row.context,
      retryCount: row.retry_count,
      lastRetryAt: row.last_retry_at,
      status: row.status as IntegrationErrorStatus,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }
}
