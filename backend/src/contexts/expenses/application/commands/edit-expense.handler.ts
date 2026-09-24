import { Inject, Injectable } from "@nestjs/common";
import { Expense } from "../../domain/expense.aggregate";
import { EXPENSE_REPOSITORY, type ExpenseRepositoryPort } from "../../domain/ports/expense-repository.port";
import { ExpenseNotFoundError } from "../../domain/errors";

export interface EditExpenseCommand {
  expenseId: string;
  categoryId?: string;
  amount?: number;
  notes?: string | null;
}

// تعديل مصروف لسه SUBMITTED (قبل المراجعة) - مفيش قيد محاسبي اتسجل لحد دلوقتي (الترحيل بيحصل وقت
// المراجعة/review بس)، فالتعديل هنا آمن تمامًا من غير أي عكس قيود - نفس تعليق PATCH /api/expenses/:id
// بالريبو القديم بالحرف
@Injectable()
export class EditExpenseHandler {
  constructor(@Inject(EXPENSE_REPOSITORY) private readonly expenses: ExpenseRepositoryPort) {}

  async execute(command: EditExpenseCommand): Promise<Expense> {
    const expense = await this.expenses.findById(command.expenseId);
    if (!expense) throw new ExpenseNotFoundError();
    expense.edit(command);
    await this.expenses.save(expense);
    return expense;
  }
}
