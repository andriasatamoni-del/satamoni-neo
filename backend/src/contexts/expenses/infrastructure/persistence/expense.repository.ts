import { Inject, Injectable } from "@nestjs/common";
import { and, count, desc, eq, type SQL } from "drizzle-orm";
import { paginate, totalOf } from "../../../../shared/database/pagination";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { Expense, type ExpenseStatus } from "../../domain/expense.aggregate";
import type { ExpenseRepositoryPort } from "../../domain/ports/expense-repository.port";
import { expenses } from "./expenses.tables";

@Injectable()
export class ExpenseRepository implements ExpenseRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(expense: Expense): Promise<void> {
    await this.db
      .insert(expenses)
      .values({
        id: expense.id,
        branch_id: expense.branchId,
        business_date: expense.businessDate,
        category_id: expense.categoryId,
        amount: expense.amount,
        notes: expense.notes,
        supplier_id: expense.supplierId,
        status: expense.status,
        created_by: expense.createdBy,
        posted_by: expense.postedBy,
        posted_at: expense.postedAt,
        journal_entry_id: expense.journalEntryId,
        cancelled_by: expense.cancelledBy,
        cancelled_at: expense.cancelledAt,
        cancellation_reason: expense.cancellationReason,
        idempotency_key: expense.idempotencyKey,
        created_at: expense.createdAt,
      })
      .onConflictDoUpdate({
        target: expenses.id,
        set: {
          category_id: expense.categoryId,
          amount: expense.amount,
          notes: expense.notes,
          status: expense.status,
          posted_by: expense.postedBy,
          posted_at: expense.postedAt,
          journal_entry_id: expense.journalEntryId,
          cancelled_by: expense.cancelledBy,
          cancelled_at: expense.cancelledAt,
          cancellation_reason: expense.cancellationReason,
        },
      });
  }

  async findById(id: string): Promise<Expense | null> {
    const [row] = await this.db.select().from(expenses).where(eq(expenses.id, id)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async findByIdempotencyKey(key: string): Promise<Expense | null> {
    const [row] = await this.db.select().from(expenses).where(eq(expenses.idempotency_key, key)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async list(filter?: { branchId?: string; businessDate?: Date; status?: string }): Promise<Expense[]> {
    return (await this.listPage(filter)).rows;
  }

  async listPage(filter?: { branchId?: string; businessDate?: Date; status?: string }, page?: PageRequest): Promise<{ rows: Expense[]; total: number }> {
    const conditions: SQL[] = [];
    if (filter?.branchId) conditions.push(eq(expenses.branch_id, filter.branchId));
    if (filter?.businessDate) conditions.push(eq(expenses.business_date, filter.businessDate));
    if (filter?.status) conditions.push(eq(expenses.status, filter.status));
    const where = and(...conditions);
    const query = this.db.select().from(expenses).where(where).orderBy(desc(expenses.business_date), desc(expenses.created_at), desc(expenses.id)).$dynamic();
    const { rows, total } = await paginate(query, page, async () => totalOf(await this.db.select({ total: count() }).from(expenses).where(where)));
    return { rows: rows.map((r) => this.toDomain(r)), total };
  }

  private toDomain(row: typeof expenses.$inferSelect): Expense {
    return Expense.reconstitute(row.id, {
      branchId: row.branch_id,
      businessDate: row.business_date,
      categoryId: row.category_id,
      amount: Number(row.amount),
      notes: row.notes,
      supplierId: row.supplier_id,
      status: row.status as ExpenseStatus,
      createdBy: row.created_by,
      postedBy: row.posted_by,
      postedAt: row.posted_at,
      journalEntryId: row.journal_entry_id,
      cancelledBy: row.cancelled_by,
      cancelledAt: row.cancelled_at,
      cancellationReason: row.cancellation_reason,
      idempotencyKey: row.idempotency_key,
      createdAt: row.created_at,
    });
  }
}
