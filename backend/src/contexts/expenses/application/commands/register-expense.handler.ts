import { Inject, Injectable } from "@nestjs/common";
import { Expense } from "../../domain/expense.aggregate";
import { EXPENSE_REPOSITORY, type ExpenseRepositoryPort } from "../../domain/ports/expense-repository.port";
import { EXPENSE_CATEGORY_REPOSITORY, type ExpenseCategoryRepositoryPort } from "../../domain/ports/expense-category-repository.port";
import { ExpenseCategoryNotFoundError } from "../../domain/errors";
import { RegisterJournalEntryHandler } from "../../../accounting/application/commands/register-journal-entry.handler";
import { ACCOUNT_REPOSITORY, type AccountRepositoryPort } from "../../../accounting/domain/ports/account-repository.port";

const DEFAULT_EXPENSE_ACCOUNT_CODE = "6900";
const ACCOUNTS_PAYABLE_ACCOUNT_CODE = "2100";
const CASH_ACCOUNT_CODE = "1100";

export interface RegisterExpenseCommand {
  branchId: string;
  businessDate: Date;
  categoryId: string;
  amount: number;
  notes?: string | null;
  supplierId?: string | null;
  // "POSTED" بيترحّل فورًا (نفس الافتراضي في الريبو القديم لو الطلب متبعتش status)، "DRAFT"/"SUBMITTED"
  // بيسجّلوا بس من غير ترحيل - محتاجين submit()/review() منفصلين بعد كده
  requestedStatus: "DRAFT" | "SUBMITTED" | "POSTED";
  createdBy?: string | null;
  idempotencyKey?: string | null;
}

// تسجيل مصروف - نفس منطق POST /api/expenses بالريبو القديم: الافتراضي (requestedStatus="POSTED")
// بيترحّل القيد المحاسبي فورًا وقت التسجيل نفسه، من غير ما يعدّي بمرحلة SUBMITTED منفصلة - راجع تعليق
// review-expense.handler.ts لمنطق اختيار حساب الدائن نفسه (نفس الكود هنا بالظبط، مكرر عمدًا بدل تجريد
// مبكر لاستخدامين بس)
@Injectable()
export class RegisterExpenseHandler {
  constructor(
    @Inject(EXPENSE_REPOSITORY) private readonly expenses: ExpenseRepositoryPort,
    @Inject(EXPENSE_CATEGORY_REPOSITORY) private readonly categories: ExpenseCategoryRepositoryPort,
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepositoryPort,
    private readonly registerJournalEntry: RegisterJournalEntryHandler
  ) {}

  async execute(command: RegisterExpenseCommand): Promise<Expense> {
    if (command.idempotencyKey) {
      const existing = await this.expenses.findByIdempotencyKey(command.idempotencyKey);
      if (existing) return existing;
    }

    const category = await this.categories.findById(command.categoryId);
    if (!category) throw new ExpenseCategoryNotFoundError();

    const expense = Expense.register({
      ...command,
      initialStatus: command.requestedStatus === "POSTED" ? "SUBMITTED" : command.requestedStatus,
    });
    await this.expenses.save(expense);

    if (command.requestedStatus === "POSTED") {
      const debitAccount = category.accountId
        ? await this.accounts.findById(category.accountId)
        : await this.accounts.findByCode(DEFAULT_EXPENSE_ACCOUNT_CODE);
      const creditAccount = expense.supplierId
        ? await this.accounts.findByCode(ACCOUNTS_PAYABLE_ACCOUNT_CODE)
        : await this.accounts.findByCode(CASH_ACCOUNT_CODE);

      if (debitAccount && creditAccount) {
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
          createdBy: command.createdBy,
        });
        expense.post({ journalEntryId: entry.id, postedBy: command.createdBy ?? null });
        await this.expenses.save(expense);
      }
    }

    return expense;
  }
}
