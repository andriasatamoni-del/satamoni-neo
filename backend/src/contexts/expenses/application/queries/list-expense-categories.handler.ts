import { Inject, Injectable } from "@nestjs/common";
import { ExpenseCategory } from "../../domain/expense-category.aggregate";
import { EXPENSE_CATEGORY_REPOSITORY, type ExpenseCategoryRepositoryPort } from "../../domain/ports/expense-category-repository.port";

@Injectable()
export class ListExpenseCategoriesHandler {
  constructor(@Inject(EXPENSE_CATEGORY_REPOSITORY) private readonly categories: ExpenseCategoryRepositoryPort) {}

  execute(): Promise<ExpenseCategory[]> {
    return this.categories.list();
  }
}
