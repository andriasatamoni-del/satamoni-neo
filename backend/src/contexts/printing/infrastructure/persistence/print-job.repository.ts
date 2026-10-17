import { Inject, Injectable } from "@nestjs/common";
import { and, asc, count, eq, sql, type SQL } from "drizzle-orm";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
import { paginate, totalOf } from "../../../../shared/database/pagination";
import { PrintJob, type PrintType, type PrintJobStatus } from "../../domain/print-job.aggregate";
import type { PrintJobRepositoryPort } from "../../domain/ports/print-job-repository.port";
import { printJobs } from "./printing.tables";

@Injectable()
export class PrintJobRepository implements PrintJobRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  // INSERT ... ON CONFLICT (idempotency_key) DO NOTHING RETURNING - نفس فلسفة insertPrintJob في
  // الريبو القديم بالظبط: لو نفس المفتاح موجود بالفعل، بيرجّع الصف الموجود من غير تعديل
  async queue(job: PrintJob): Promise<PrintJob> {
    const [inserted] = await this.db
      .insert(printJobs)
      .values(this.toRow(job))
      .onConflictDoNothing({ target: printJobs.idempotency_key })
      .returning();
    if (inserted) return this.toDomain(inserted);
    const [existing] = await this.db.select().from(printJobs).where(eq(printJobs.idempotency_key, job.idempotencyKey)).limit(1);
    if (!existing) throw new Error(`print job ${job.idempotencyKey} vanished after a conflicting insert`);
    return this.toDomain(existing);
  }

  async claim(id: string): Promise<PrintJob | null> {
    const [row] = await this.db
      .update(printJobs)
      .set({ status: "PRINTING", printing_started_at: new Date(), attempts: sql`${printJobs.attempts} + 1` })
      .where(and(eq(printJobs.id, id), eq(printJobs.status, "PENDING")))
      .returning();
    return row ? this.toDomain(row) : null;
  }

  async markPrinted(id: string): Promise<PrintJob | null> {
    const [row] = await this.db
      .update(printJobs)
      .set({ status: "PRINTED", printed_at: new Date() })
      .where(and(eq(printJobs.id, id), eq(printJobs.status, "PRINTING")))
      .returning();
    return row ? this.toDomain(row) : null;
  }

  async markFailed(id: string, error: string | null): Promise<PrintJob | null> {
    const [row] = await this.db
      .update(printJobs)
      .set({ status: "FAILED", failed_at: new Date(), last_error: error || "فشلت الطباعة" })
      .where(and(eq(printJobs.id, id), eq(printJobs.status, "PRINTING")))
      .returning();
    return row ? this.toDomain(row) : null;
  }

  async retry(id: string): Promise<PrintJob | null> {
    const [row] = await this.db
      .update(printJobs)
      .set({ status: "PENDING", last_error: null, failed_at: null })
      .where(and(eq(printJobs.id, id), eq(printJobs.status, "FAILED")))
      .returning();
    return row ? this.toDomain(row) : null;
  }

  async findById(id: string): Promise<PrintJob | null> {
    const [row] = await this.db.select().from(printJobs).where(eq(printJobs.id, id)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async list(filter: { branchId: string; status?: string; orderId?: string }, page: PageRequest): Promise<{ jobs: PrintJob[]; total: number }> {
    const conditions: SQL[] = [eq(printJobs.branch_id, filter.branchId)];
    if (filter.status) conditions.push(eq(printJobs.status, filter.status));
    if (filter.orderId) conditions.push(eq(printJobs.order_id, filter.orderId));
    const where = and(...conditions);
    const query = this.db.select().from(printJobs).where(where).orderBy(asc(printJobs.created_at), asc(printJobs.id)).$dynamic();
    const { rows, total } = await paginate(query, page, async () => totalOf(await this.db.select({ total: count() }).from(printJobs).where(where)));
    return { jobs: rows.map((r) => this.toDomain(r)), total };
  }

  private toRow(job: PrintJob): typeof printJobs.$inferInsert {
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

  private toDomain(row: typeof printJobs.$inferSelect): PrintJob {
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
