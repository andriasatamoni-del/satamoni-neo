import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, type SQL } from "drizzle-orm";
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
    const conditions: SQL[] = [];
    if (filter?.branchId) conditions.push(eq(expenses.branch_id, filter.branchId));
    if (filter?.businessDate) conditions.push(eq(expenses.business_date, filter.businessDate));
    if (filter?.status) conditions.push(eq(expenses.status, filter.status));
    const rows = await this.db
      .select()
      .from(expenses)
      .where(and(...conditions))
      .orderBy(desc(expenses.business_date), desc(expenses.created_at));
    return rows.map((r) => this.toDomain(r));
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
