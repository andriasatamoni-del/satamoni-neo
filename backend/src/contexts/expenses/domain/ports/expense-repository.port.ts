import type { Expense } from "../expense.aggregate";

export interface ExpenseRepositoryPort {
  save(expense: Expense): Promise<void>;
  findById(id: string): Promise<Expense | null>;
  findByIdempotencyKey(key: string): Promise<Expense | null>;
  list(filter?: { branchId?: string; businessDate?: Date; status?: string }): Promise<Expense[]>;
}

export const EXPENSE_REPOSITORY = Symbol("EXPENSE_REPOSITORY");
