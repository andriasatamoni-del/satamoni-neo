import { Inject, Injectable } from "@nestjs/common";
import { ExpenseCategory } from "../../domain/expense-category.aggregate";
import { EXPENSE_CATEGORY_REPOSITORY, type ExpenseCategoryRepositoryPort } from "../../domain/ports/expense-category-repository.port";
import { ExpenseCategoryNotFoundError } from "../../domain/errors";

export interface UpdateExpenseCategoryCommand {
  categoryId: string;
  name?: string;
  isActive?: boolean;
  alertThreshold?: number | null;
  accountId?: string | null;
}

@Injectable()
export class UpdateExpenseCategoryHandler {
  constructor(@Inject(EXPENSE_CATEGORY_REPOSITORY) private readonly categories: ExpenseCategoryRepositoryPort) {}

  async execute(command: UpdateExpenseCategoryCommand): Promise<ExpenseCategory> {
    const category = await this.categories.findById(command.categoryId);
    if (!category) throw new ExpenseCategoryNotFoundError();
    category.update(command);
    await this.categories.save(category);
    return category;
  }
}
