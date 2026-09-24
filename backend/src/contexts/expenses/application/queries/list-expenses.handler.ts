import { Inject, Injectable } from "@nestjs/common";
import { Expense } from "../../domain/expense.aggregate";
import { EXPENSE_REPOSITORY, type ExpenseRepositoryPort } from "../../domain/ports/expense-repository.port";

export interface ListExpensesQuery {
  branchId?: string;
  businessDate?: Date;
  status?: string;
}

@Injectable()
export class ListExpensesHandler {
  constructor(@Inject(EXPENSE_REPOSITORY) private readonly expenses: ExpenseRepositoryPort) {}

  execute(query: ListExpensesQuery): Promise<Expense[]> {
    return this.expenses.list(query);
  }
}
