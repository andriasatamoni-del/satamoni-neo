import { Inject, Injectable } from "@nestjs/common";
import { ExpenseCategory } from "../../domain/expense-category.aggregate";
import { EXPENSE_CATEGORY_REPOSITORY, type ExpenseCategoryRepositoryPort } from "../../domain/ports/expense-category-repository.port";
import { DuplicateExpenseCategoryNameError } from "../../domain/errors";

export interface RegisterExpenseCategoryCommand {
  name: string;
  accountId?: string | null;
  alertThreshold?: number | null;
}

@Injectable()
export class RegisterExpenseCategoryHandler {
  constructor(@Inject(EXPENSE_CATEGORY_REPOSITORY) private readonly categories: ExpenseCategoryRepositoryPort) {}

  async execute(command: RegisterExpenseCategoryCommand): Promise<ExpenseCategory> {
    if (await this.categories.existsByName(command.name.trim())) throw new DuplicateExpenseCategoryNameError(command.name.trim());
    const category = ExpenseCategory.register(command);
    await this.categories.save(category);
    return category;
  }
}
