import { Inject, Injectable } from "@nestjs/common";
import { Expense } from "../../domain/expense.aggregate";
import { EXPENSE_REPOSITORY, type ExpenseRepositoryPort } from "../../domain/ports/expense-repository.port";
import { ExpenseNotFoundError } from "../../domain/errors";

export interface SubmitExpenseCommand {
  expenseId: string;
}

@Injectable()
export class SubmitExpenseHandler {
  constructor(@Inject(EXPENSE_REPOSITORY) private readonly expenses: ExpenseRepositoryPort) {}

  async execute(command: SubmitExpenseCommand): Promise<Expense> {
    const expense = await this.expenses.findById(command.expenseId);
    if (!expense) throw new ExpenseNotFoundError();
    expense.submit();
    await this.expenses.save(expense);
    return expense;
  }
}
