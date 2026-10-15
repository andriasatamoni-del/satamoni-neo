import { Module } from "@nestjs/common";
import { IdentityAccessModule } from "../identity-access/identity-access.module";
import { AccountingModule } from "../accounting/accounting.module";
import { EXPENSE_CATEGORY_REPOSITORY } from "./domain/ports/expense-category-repository.port";
import { EXPENSE_REPOSITORY } from "./domain/ports/expense-repository.port";
import { ExpenseCategoryRepository } from "./infrastructure/persistence/expense-category.repository";
import { ExpenseRepository } from "./infrastructure/persistence/expense.repository";
import { RegisterExpenseCategoryHandler } from "./application/commands/register-expense-category.handler";
import { UpdateExpenseCategoryHandler } from "./application/commands/update-expense-category.handler";
import { RegisterExpenseHandler } from "./application/commands/register-expense.handler";
import { EditExpenseHandler } from "./application/commands/edit-expense.handler";
import { SubmitExpenseHandler } from "./application/commands/submit-expense.handler";
import { ReviewExpenseHandler } from "./application/commands/review-expense.handler";
import { CancelExpenseHandler } from "./application/commands/cancel-expense.handler";
import { ListExpenseCategoriesHandler } from "./application/queries/list-expense-categories.handler";
import { ListExpensesHandler } from "./application/queries/list-expenses.handler";
import { GetExpenseHandler } from "./application/queries/get-expense.handler";
import { ExpensesController } from "./api/expenses.controller";

@Module({
  imports: [IdentityAccessModule, AccountingModule],
  controllers: [ExpensesController],
  providers: [
    { provide: EXPENSE_CATEGORY_REPOSITORY, useClass: ExpenseCategoryRepository },
    { provide: EXPENSE_REPOSITORY, useClass: ExpenseRepository },
    RegisterExpenseCategoryHandler,
    UpdateExpenseCategoryHandler,
    RegisterExpenseHandler,
    EditExpenseHandler,
    SubmitExpenseHandler,
    ReviewExpenseHandler,
    CancelExpenseHandler,
    ListExpenseCategoriesHandler,
    ListExpensesHandler,
    GetExpenseHandler,
  ],
})
export class ExpensesModule {}
