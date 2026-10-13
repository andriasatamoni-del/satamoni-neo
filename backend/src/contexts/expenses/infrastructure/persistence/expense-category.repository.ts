import { Inject, Injectable } from "@nestjs/common";
import { asc, eq } from "drizzle-orm";
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
    const rows = await this.db.select().from(expenseCategories).orderBy(asc(expenseCategories.name));
    return rows.map((r) => this.toDomain(r));
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
