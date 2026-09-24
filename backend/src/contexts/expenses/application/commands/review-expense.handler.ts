import { Inject, Injectable } from "@nestjs/common";
import { Expense } from "../../domain/expense.aggregate";
import { EXPENSE_REPOSITORY, type ExpenseRepositoryPort } from "../../domain/ports/expense-repository.port";
import { EXPENSE_CATEGORY_REPOSITORY, type ExpenseCategoryRepositoryPort } from "../../domain/ports/expense-category-repository.port";
import { ExpenseNotFoundError, ExpenseCategoryNotFoundError } from "../../domain/errors";
import { RegisterJournalEntryHandler } from "../../../accounting/application/commands/register-journal-entry.handler";
import { ACCOUNT_REPOSITORY, type AccountRepositoryPort } from "../../../accounting/domain/ports/account-repository.port";
import { AccountNotFoundError } from "../../../accounting/domain/errors";

const DEFAULT_EXPENSE_ACCOUNT_CODE = "6900";
const ACCOUNTS_PAYABLE_ACCOUNT_CODE = "2100";
const CASH_ACCOUNT_CODE = "1100";

export interface ReviewExpenseCommand {
  expenseId: string;
  reviewedBy: string | null;
}

// مراجعة مصروف SUBMITTED - اعتماد + ترحيل في خطوة واحدة (نفس مسار /review بالريبو القديم، راجع تعليق
// expense.aggregate.ts للفلسفة). حساب المدين: حساب البند المرتبط لو موجود، وإلا 6900 الافتراضي. حساب
// الدائن: مورد (2100) لو مصروف على ذمة مورد، وإلا كاش الفرع (1100)
@Injectable()
export class ReviewExpenseHandler {
  constructor(
    @Inject(EXPENSE_REPOSITORY) private readonly expenses: ExpenseRepositoryPort,
    @Inject(EXPENSE_CATEGORY_REPOSITORY) private readonly categories: ExpenseCategoryRepositoryPort,
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepositoryPort,
    private readonly registerJournalEntry: RegisterJournalEntryHandler
  ) {}

  async execute(command: ReviewExpenseCommand): Promise<Expense> {
    const expense = await this.expenses.findById(command.expenseId);
    if (!expense) throw new ExpenseNotFoundError();

    const category = await this.categories.findById(expense.categoryId);
    if (!category) throw new ExpenseCategoryNotFoundError();

    const debitAccount = category.accountId
      ? await this.accounts.findById(category.accountId)
      : await this.accounts.findByCode(DEFAULT_EXPENSE_ACCOUNT_CODE);
    const creditAccount = expense.supplierId
      ? await this.accounts.findByCode(ACCOUNTS_PAYABLE_ACCOUNT_CODE)
      : await this.accounts.findByCode(CASH_ACCOUNT_CODE);
    if (!debitAccount || !creditAccount) throw new AccountNotFoundError();

    const entry = await this.registerJournalEntry.execute({
      sourceType: "expense",
      sourceId: expense.id,
      branchId: expense.branchId,
      entryDate: expense.businessDate,
      description: `مصروف: ${category.name}`,
      lines: [
        { accountId: debitAccount.id, debit: expense.amount, credit: 0 },
        {
          accountId: creditAccount.id,
          debit: 0,
          credit: expense.amount,
          referenceType: expense.supplierId ? "supplier" : null,
          referenceId: expense.supplierId,
        },
      ],
      createdBy: command.reviewedBy,
    });

    expense.post({ journalEntryId: entry.id, postedBy: command.reviewedBy });
    await this.expenses.save(expense);
    return expense;
  }
}
