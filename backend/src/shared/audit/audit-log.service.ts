import { Inject, Injectable } from "@nestjs/common";
import type { Kysely } from "kysely";
import type { Database } from "../database/database.types";
import { KYSELY } from "../database/database.module";

export interface AuditLogEntry {
  actorUserId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  branchId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface AuditLogRecord {
  id: string;
  actorUserId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  branchId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export interface AuditLogFilter {
  actorUserId?: string;
  entityType?: string;
  entityId?: string;
  branchId?: string;
  action?: string;
  limit?: number;
}

// AuditLogService - سجل تدقيق عام (fire-and-forget، مش أجريجيت دومين له قواعد عمل - مجرد حقائق ثابتة
// مسجّلة)، بينكتب تلقائيًا من AuditLogInterceptor العام لكل طلب API بينجح وبيغيّر حالة. راجع تعليق
// migration 021_create_audit_logs_table.ts للفرق بينه وبين event_outbox
@Injectable()
export class AuditLogService {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async record(entry: AuditLogEntry): Promise<void> {
    await this.db
      .insertInto("audit_logs")
      .values({
        actor_user_id: entry.actorUserId ?? null,
        action: entry.action,
        entity_type: entry.entityType ?? null,
        entity_id: entry.entityId ?? null,
        branch_id: entry.branchId ?? null,
        metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
      })
      .execute();
  }

  async list(filter?: AuditLogFilter): Promise<AuditLogRecord[]> {
    let query = this.db.selectFrom("audit_logs").selectAll();
    if (filter?.actorUserId) query = query.where("actor_user_id", "=", filter.actorUserId);
    if (filter?.entityType) query = query.where("entity_type", "=", filter.entityType);
    if (filter?.entityId) query = query.where("entity_id", "=", filter.entityId);
    if (filter?.branchId) query = query.where("branch_id", "=", filter.branchId);
    if (filter?.action) query = query.where("action", "=", filter.action);

    const limit = Math.min(Math.max(filter?.limit ?? 100, 1), 500);
    const rows = await query.orderBy("created_at", "desc").limit(limit).execute();

    return rows.map((r) => ({
      id: r.id,
      actorUserId: r.actor_user_id,
      action: r.action,
      entityType: r.entity_type,
      entityId: r.entity_id,
      branchId: r.branch_id,
      metadata: r.metadata,
      createdAt: r.created_at,
    }));
  }
}
