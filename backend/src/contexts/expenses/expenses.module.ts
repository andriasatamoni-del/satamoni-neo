import { Module, OnModuleInit } from "@nestjs/common";
import { PermissionRegistry } from "../../shared/permissions/permission-registry";
import { IdentityAccessModule } from "../identity-access/identity-access.module";
import { AccountingModule } from "../accounting/accounting.module";
import { EXPENSE_CATEGORY_REPOSITORY } from "./domain/ports/expense-category-repository.port";
import { EXPENSE_REPOSITORY } from "./domain/ports/expense-repository.port";
import { KyselyExpenseCategoryRepository } from "./infrastructure/persistence/kysely-expense-category.repository";
import { KyselyExpenseRepository } from "./infrastructure/persistence/kysely-expense.repository";
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
    { provide: EXPENSE_CATEGORY_REPOSITORY, useClass: KyselyExpenseCategoryRepository },
    { provide: EXPENSE_REPOSITORY, useClass: KyselyExpenseRepository },
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
export class ExpensesModule implements OnModuleInit {
  constructor(private readonly permissions: PermissionRegistry) {}

  onModuleInit(): void {
    this.permissions.registerGroup({
      group: "expenses",
      groupLabel: "المصروفات",
      permissions: [
        { key: "expenses.view", label: "رؤية المصروفات" },
        { key: "expenses.create", label: "تسجيل مصروف (كامل، أي فرع)" },
        { key: "expenses.create_own_daily", label: "تسجيل مصروف نقدي (كاشير - فرعه/النهاردة بس)" },
        { key: "expenses.review", label: "مراجعة واعتماد مصروف مقدّم" },
        { key: "expenses.manage", label: "إدارة بنود المصروفات (تكويد)" },
      ],
    });
    this.permissions.setRoleDefaults("branch_manager", ["expenses.view", "expenses.create", "expenses.review"]);
    this.permissions.setRoleDefaults("accountant", ["expenses.view", "expenses.create", "expenses.review", "expenses.manage"]);
    this.permissions.setRoleDefaults("cashier", ["expenses.create_own_daily"]);
  }
}
