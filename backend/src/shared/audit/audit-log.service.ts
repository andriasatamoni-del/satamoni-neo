import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import { DATABASE, type Database } from "../database/database.token";
import { auditLogs } from "../database/shared.tables";

export interface AuditLogEntry {
  actorUserId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  branchId?: string | null;
  metadata?: Record<string, unknown> | null;
  // Phase 3.1: SUCCESS (default) | DENIED (403/404 on a protected resource) | FAILED
  outcome?: "SUCCESS" | "DENIED" | "FAILED";
  httpStatus?: number | null;
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
  outcome: string;
  httpStatus: number | null;
}

export interface AuditLogFilter {
  actorUserId?: string;
  entityType?: string;
  entityId?: string;
  branchId?: string;
  action?: string;
  limit?: number;
  outcome?: string;
}

// AuditLogService - سجل تدقيق عام (fire-and-forget، مش أجريجيت دومين له قواعد عمل - مجرد حقائق ثابتة
// مسجّلة)، بينكتب تلقائيًا من AuditLogInterceptor العام لكل طلب API بينجح وبيغيّر حالة. راجع تعليق
// migration 021_create_audit_logs_table.ts للفرق بينه وبين event_outbox
@Injectable()
export class AuditLogService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async record(entry: AuditLogEntry): Promise<void> {
    // metadata is jsonb: Drizzle serialises the object itself
    await this.db.insert(auditLogs).values({
      actor_user_id: entry.actorUserId ?? null,
      action: entry.action,
      entity_type: entry.entityType ?? null,
      entity_id: entry.entityId ?? null,
      branch_id: entry.branchId ?? null,
      metadata: entry.metadata ?? null,
      outcome: entry.outcome ?? "SUCCESS",
      http_status: entry.httpStatus ?? null,
    });
  }

  async list(filter?: AuditLogFilter): Promise<AuditLogRecord[]> {
    const limit = Math.min(Math.max(filter?.limit ?? 100, 1), 500);
    const rows = await this.db
      .select()
      .from(auditLogs)
      .where(
        and(
          filter?.actorUserId ? eq(auditLogs.actor_user_id, filter.actorUserId) : undefined,
          filter?.entityType ? eq(auditLogs.entity_type, filter.entityType) : undefined,
          filter?.entityId ? eq(auditLogs.entity_id, filter.entityId) : undefined,
          filter?.branchId ? eq(auditLogs.branch_id, filter.branchId) : undefined,
          filter?.action ? eq(auditLogs.action, filter.action) : undefined,
          filter?.outcome ? eq(auditLogs.outcome, filter.outcome as "SUCCESS" | "DENIED" | "FAILED") : undefined
        )
      )
      .orderBy(desc(auditLogs.created_at))
      .limit(limit);

    return rows.map((r) => ({
      id: r.id,
      actorUserId: r.actor_user_id,
      action: r.action,
      entityType: r.entity_type,
      entityId: r.entity_id,
      branchId: r.branch_id,
      metadata: r.metadata,
      createdAt: r.created_at,
      outcome: r.outcome,
      httpStatus: r.http_status,
    }));
  }
}
