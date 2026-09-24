import { Inject, Injectable } from "@nestjs/common";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { Expense, type ExpenseStatus } from "../../domain/expense.aggregate";
import type { ExpenseRepositoryPort } from "../../domain/ports/expense-repository.port";
import type { ExpensesTable } from "./expense.schema";

@Injectable()
export class KyselyExpenseRepository implements ExpenseRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async save(expense: Expense): Promise<void> {
    await this.db
      .insertInto("expenses")
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
      .onConflict((oc) =>
        oc.column("id").doUpdateSet({
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
        })
      )
      .execute();
  }

  async findById(id: string): Promise<Expense | null> {
    const row = await this.db.selectFrom("expenses").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async findByIdempotencyKey(key: string): Promise<Expense | null> {
    const row = await this.db.selectFrom("expenses").selectAll().where("idempotency_key", "=", key).executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async list(filter?: { branchId?: string; businessDate?: Date; status?: string }): Promise<Expense[]> {
    let query = this.db.selectFrom("expenses").selectAll();
    if (filter?.branchId) query = query.where("branch_id", "=", filter.branchId);
    if (filter?.businessDate) query = query.where("business_date", "=", filter.businessDate);
    if (filter?.status) query = query.where("status", "=", filter.status);
    const rows = await query.orderBy("business_date", "desc").orderBy("created_at", "desc").execute();
    return rows.map((r) => this.toDomain(r));
  }

  private toDomain(row: Selectable<ExpensesTable>): Expense {
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
