import { Inject, Injectable } from "@nestjs/common";
import { Expense } from "../../domain/expense.aggregate";
import { EXPENSE_REPOSITORY, type ExpenseRepositoryPort } from "../../domain/ports/expense-repository.port";
import { ExpenseNotFoundError } from "../../domain/errors";

@Injectable()
export class GetExpenseHandler {
  constructor(@Inject(EXPENSE_REPOSITORY) private readonly expenses: ExpenseRepositoryPort) {}

  async execute(id: string): Promise<Expense> {
    const expense = await this.expenses.findById(id);
    if (!expense) throw new ExpenseNotFoundError();
    return expense;
  }
}
