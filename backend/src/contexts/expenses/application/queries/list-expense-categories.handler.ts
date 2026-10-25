import { Inject, Injectable } from "@nestjs/common";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
import { ExpenseCategory } from "../../domain/expense-category.aggregate";
import { EXPENSE_CATEGORY_REPOSITORY, type ExpenseCategoryRepositoryPort } from "../../domain/ports/expense-category-repository.port";

@Injectable()
export class ListExpenseCategoriesHandler {
  constructor(@Inject(EXPENSE_CATEGORY_REPOSITORY) private readonly categories: ExpenseCategoryRepositoryPort) {}

  execute(page?: PageRequest): Promise<{ rows: ExpenseCategory[]; total: number }> {
    return this.categories.listPage(page);
  }
}
