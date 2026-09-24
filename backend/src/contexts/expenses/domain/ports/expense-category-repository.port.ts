import type { ExpenseCategory } from "../expense-category.aggregate";

export interface ExpenseCategoryRepositoryPort {
  save(category: ExpenseCategory): Promise<void>;
  findById(id: string): Promise<ExpenseCategory | null>;
  existsByName(name: string): Promise<boolean>;
  list(): Promise<ExpenseCategory[]>;
}

export const EXPENSE_CATEGORY_REPOSITORY = Symbol("EXPENSE_CATEGORY_REPOSITORY");
