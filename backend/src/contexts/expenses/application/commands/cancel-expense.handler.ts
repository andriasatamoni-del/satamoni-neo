import { Inject, Injectable } from "@nestjs/common";
import { Expense } from "../../domain/expense.aggregate";
import { EXPENSE_REPOSITORY, type ExpenseRepositoryPort } from "../../domain/ports/expense-repository.port";
import { ExpenseNotFoundError } from "../../domain/errors";

export interface CancelExpenseCommand {
  expenseId: string;
  cancelledBy: string | null;
  reason: string;
}

@Injectable()
export class CancelExpenseHandler {
  constructor(@Inject(EXPENSE_REPOSITORY) private readonly expenses: ExpenseRepositoryPort) {}

  async execute(command: CancelExpenseCommand): Promise<Expense> {
    const expense = await this.expenses.findById(command.expenseId);
    if (!expense) throw new ExpenseNotFoundError();
    expense.cancel({ cancelledBy: command.cancelledBy, reason: command.reason });
    await this.expenses.save(expense);
    return expense;
  }
}
