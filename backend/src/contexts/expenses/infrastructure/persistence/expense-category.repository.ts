import { Inject, Injectable } from "@nestjs/common";
import { asc, count, desc, eq } from "drizzle-orm";
import { paginate, totalOf } from "../../../../shared/database/pagination";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
import { DATABASE, type Database } from "../../../../shared/database/database.token";
import { ExpenseCategory } from "../../domain/expense-category.aggregate";
import type { ExpenseCategoryRepositoryPort } from "../../domain/ports/expense-category-repository.port";
import { expenseCategories } from "./expenses.tables";

@Injectable()
export class ExpenseCategoryRepository implements ExpenseCategoryRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(category: ExpenseCategory): Promise<void> {
    await this.db
      .insert(expenseCategories)
      .values({
        id: category.id,
        name: category.name,
        is_active: category.isActive,
        alert_threshold: category.alertThreshold,
        account_id: category.accountId,
        created_at: category.createdAt,
      })
      .onConflictDoUpdate({
        target: expenseCategories.id,
        set: {
          name: category.name,
          is_active: category.isActive,
          alert_threshold: category.alertThreshold,
          account_id: category.accountId,
        },
      });
  }

  async findById(id: string): Promise<ExpenseCategory | null> {
    const [row] = await this.db.select().from(expenseCategories).where(eq(expenseCategories.id, id)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async existsByName(name: string): Promise<boolean> {
    const [row] = await this.db.select({ id: expenseCategories.id }).from(expenseCategories).where(eq(expenseCategories.name, name)).limit(1);
    return !!row;
  }

  async list(): Promise<ExpenseCategory[]> {
    return (await this.listPage()).rows;
  }

  async listPage(page?: PageRequest): Promise<{ rows: ExpenseCategory[]; total: number }> {
    const query = this.db.select().from(expenseCategories).orderBy(asc(expenseCategories.name), desc(expenseCategories.id)).$dynamic();
    const { rows, total } = await paginate(query, page, async () => totalOf(await this.db.select({ total: count() }).from(expenseCategories)));
    return { rows: rows.map((r) => this.toDomain(r)), total };
  }

  private toDomain(row: typeof expenseCategories.$inferSelect): ExpenseCategory {
    return ExpenseCategory.reconstitute(row.id, {
      name: row.name,
      isActive: row.is_active,
      alertThreshold: row.alert_threshold === null ? null : Number(row.alert_threshold),
      accountId: row.account_id,
      createdAt: row.created_at,
    });
  }
}
