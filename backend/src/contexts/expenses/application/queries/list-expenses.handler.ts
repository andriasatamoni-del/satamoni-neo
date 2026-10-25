import { Inject, Injectable } from "@nestjs/common";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
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

  execute(query: ListExpensesQuery, page?: PageRequest): Promise<{ rows: Expense[]; total: number }> {
    return this.expenses.listPage(query, page);
  }
}
