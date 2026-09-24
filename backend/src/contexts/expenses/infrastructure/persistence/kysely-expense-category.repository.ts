import { Inject, Injectable } from "@nestjs/common";
import type { Kysely, Selectable } from "kysely";
import type { Database } from "../../../../shared/database/database.types";
import { KYSELY } from "../../../../shared/database/database.module";
import { ExpenseCategory } from "../../domain/expense-category.aggregate";
import type { ExpenseCategoryRepositoryPort } from "../../domain/ports/expense-category-repository.port";
import type { ExpenseCategoriesTable } from "./expense-category.schema";

@Injectable()
export class KyselyExpenseCategoryRepository implements ExpenseCategoryRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async save(category: ExpenseCategory): Promise<void> {
    await this.db
      .insertInto("expense_categories")
      .values({
        id: category.id,
        name: category.name,
        is_active: category.isActive,
        alert_threshold: category.alertThreshold,
        account_id: category.accountId,
        created_at: category.createdAt,
      })
      .onConflict((oc) =>
        oc.column("id").doUpdateSet({
          name: category.name,
          is_active: category.isActive,
          alert_threshold: category.alertThreshold,
          account_id: category.accountId,
        })
      )
      .execute();
  }

  async findById(id: string): Promise<ExpenseCategory | null> {
    const row = await this.db.selectFrom("expense_categories").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? this.toDomain(row) : null;
  }

  async existsByName(name: string): Promise<boolean> {
    const row = await this.db.selectFrom("expense_categories").select("id").where("name", "=", name).executeTakeFirst();
    return !!row;
  }

  async list(): Promise<ExpenseCategory[]> {
    const rows = await this.db.selectFrom("expense_categories").selectAll().orderBy("name").execute();
    return rows.map((r) => this.toDomain(r));
  }

  private toDomain(row: Selectable<ExpenseCategoriesTable>): ExpenseCategory {
    return ExpenseCategory.reconstitute(row.id, {
      name: row.name,
      isActive: row.is_active,
      alertThreshold: row.alert_threshold === null ? null : Number(row.alert_threshold),
      accountId: row.account_id,
      createdAt: row.created_at,
    });
  }
}
