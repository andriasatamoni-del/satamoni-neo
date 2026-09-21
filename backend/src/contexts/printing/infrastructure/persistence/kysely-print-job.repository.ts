import { Inject, Injectable } from "@nestjs/common";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { PrintJob, type PrintType, type PrintJobStatus } from "../../domain/print-job.aggregate";
import type { PrintJobRepositoryPort } from "../../domain/ports/print-job-repository.port";
import type { PrintJobsTable } from "./printing.schema";

@Injectable()
export class KyselyPrintJobRepository implements PrintJobRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  // INSERT ... ON CONFLICT (idempotency_key) DO NOTHING RETURNING - نفس فلسفة insertPrintJob في
  // الريبو القديم بالظبط: لو نفس المفتاح موجود بالفعل، بيرجّع الصف الموجود من غير تعديل
  async queue(job: PrintJob): Promise<PrintJob> {
    const row = this.toRow(job);
    const inserted = await this.db
      .insertInto("print_jobs")
      .values(row)
      .onConflict((oc) => oc.column("idempotency_key").doNothing())
      .returningAll()
      .executeTakeFirst();
    if (inserted) return this.toDomain(inserted);
    const existing = await this.db
      .selectFrom("print_jobs")
      .selectAll()
      .where("idempotency_key", "=", job.idempotencyKey)
      .executeTakeFirstOrThrow();
    return this.toDomain(existing);
  }

  async claim(id: string): Promise<PrintJob | null> {
    const row = await this.db
      .updateTable("print_jobs")
      .set((eb) => ({ status: "PRINTING", printing_started_at: new Date(), attempts: eb("attempts", "+", 1) }))
      .where("id", "=", id)
      .where("status", "=", "PENDING")
      .returningAll()
      .executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async markPrinted(id: string): Promise<PrintJob | null> {
    const row = await this.db
      .updateTable("print_jobs")
      .set({ status: "PRINTED", printed_at: new Date() })
      .where("id", "=", id)
      .where("status", "=", "PRINTING")
      .returningAll()
      .executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async markFailed(id: string, error: string | null): Promise<PrintJob | null> {
    const row = await this.db
      .updateTable("print_jobs")
      .set({ status: "FAILED", failed_at: new Date(), last_error: error || "فشلت الطباعة" })
      .where("id", "=", id)
      .where("status", "=", "PRINTING")
      .returningAll()
      .executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async retry(id: string): Promise<PrintJob | null> {
    const row = await this.db
      .updateTable("print_jobs")
      .set({ status: "PENDING", last_error: null, failed_at: null })
      .where("id", "=", id)
      .where("status", "=", "FAILED")
      .returningAll()
      .executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async findById(id: string): Promise<PrintJob | null> {
    const row = await this.db.selectFrom("print_jobs").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async list(filter: { branchId: string; status?: string; orderId?: string; limit?: number }): Promise<PrintJob[]> {
    let query = this.db.selectFrom("print_jobs").selectAll().where("branch_id", "=", filter.branchId);
    if (filter.status) query = query.where("status", "=", filter.status);
    if (filter.orderId) query = query.where("order_id", "=", filter.orderId);
    const rows = await query
      .orderBy("created_at", "asc")
      .limit(Math.min(filter.limit ?? 100, 300))
      .execute();
    return rows.map((r) => this.toDomain(r));
  }

  private toRow(job: PrintJob) {
    return {
      id: job.id,
      order_id: job.orderId,
      branch_id: job.branchId,
      print_type: job.printType,
      printer_id: job.printerId,
      station_id: job.stationId,
      status: job.status,
      content_html: job.contentHtml,
      idempotency_key: job.idempotencyKey,
      attempts: job.attempts,
      last_error: job.lastError,
      created_by: job.createdBy,
      created_at: job.createdAt,
      printing_started_at: job.printingStartedAt,
      printed_at: job.printedAt,
      failed_at: job.failedAt,
    };
  }

  private toDomain(row: Selectable<PrintJobsTable>): PrintJob {
    return PrintJob.reconstitute(row.id, {
      orderId: row.order_id,
      branchId: row.branch_id,
      printType: row.print_type as PrintType,
      printerId: row.printer_id,
      stationId: row.station_id,
      status: row.status as PrintJobStatus,
      contentHtml: row.content_html,
      idempotencyKey: row.idempotency_key,
      attempts: row.attempts,
      lastError: row.last_error,
      createdBy: row.created_by,
      createdAt: row.created_at,
      printingStartedAt: row.printing_started_at,
      printedAt: row.printed_at,
      failedAt: row.failed_at,
    });
  }
}
