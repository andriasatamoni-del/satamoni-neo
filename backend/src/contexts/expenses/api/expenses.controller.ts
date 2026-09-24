import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseFilters, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { RegisterExpenseCategoryHandler } from "../application/commands/register-expense-category.handler";
import { UpdateExpenseCategoryHandler } from "../application/commands/update-expense-category.handler";
import { RegisterExpenseHandler } from "../application/commands/register-expense.handler";
import { EditExpenseHandler } from "../application/commands/edit-expense.handler";
import { SubmitExpenseHandler } from "../application/commands/submit-expense.handler";
import { ReviewExpenseHandler } from "../application/commands/review-expense.handler";
import { CancelExpenseHandler } from "../application/commands/cancel-expense.handler";
import { ListExpenseCategoriesHandler } from "../application/queries/list-expense-categories.handler";
import { ListExpensesHandler } from "../application/queries/list-expenses.handler";
import { GetExpenseHandler } from "../application/queries/get-expense.handler";
import { RegisterExpenseCategoryDto } from "./dto/register-expense-category.dto";
import { UpdateExpenseCategoryDto } from "./dto/update-expense-category.dto";
import { RegisterExpenseDto } from "./dto/register-expense.dto";
import { EditExpenseDto } from "./dto/edit-expense.dto";
import { CancelExpenseDto } from "./dto/cancel-expense.dto";
import { JwtAuthGuard } from "../../identity-access/api/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../identity-access/api/guards/permissions.guard";
import { RequirePermission } from "../../identity-access/api/guards/require-permission.decorator";
import type { AuthenticatedUser } from "../../identity-access/api/types";
import { ExpensesDomainErrorFilter } from "./filters/domain-error.filter";
import type { ExpenseCategory } from "../domain/expense-category.aggregate";
import type { Expense } from "../domain/expense.aggregate";

@Controller("expenses")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseFilters(ExpensesDomainErrorFilter)
export class ExpensesController {
  constructor(
    private readonly registerCategory: RegisterExpenseCategoryHandler,
    private readonly updateCategory: UpdateExpenseCategoryHandler,
    private readonly registerExpense: RegisterExpenseHandler,
    private readonly editExpense: EditExpenseHandler,
    private readonly submitExpense: SubmitExpenseHandler,
    private readonly reviewExpense: ReviewExpenseHandler,
    private readonly cancelExpense: CancelExpenseHandler,
    private readonly listCategories: ListExpenseCategoriesHandler,
    private readonly listExpenses: ListExpensesHandler,
    private readonly getExpense: GetExpenseHandler
  ) {}

  @Get("categories")
  @RequirePermission("expenses.view", "expenses.create", "expenses.create_own_daily", "expenses.manage")
  async categories() {
    return (await this.listCategories.execute()).map(toPublicCategory);
  }

  @Post("categories")
  @RequirePermission("expenses.manage")
  async createCategory(@Body() dto: RegisterExpenseCategoryDto) {
    return toPublicCategory(await this.registerCategory.execute(dto));
  }

  @Patch("categories/:id")
  @RequirePermission("expenses.manage")
  async updateCategoryRoute(@Param("id") id: string, @Body() dto: UpdateExpenseCategoryDto) {
    return toPublicCategory(await this.updateCategory.execute({ categoryId: id, ...dto }));
  }

  @Get()
  @RequirePermission("expenses.view", "expenses.create_own_daily")
  async list(
    @Query("branchId") branchId: string | undefined,
    @Query("businessDate") businessDate: string | undefined,
    @Query("status") status: string | undefined,
    @Req() req: Request & { user: AuthenticatedUser }
  ) {
    // نفس فلسفة الريبو القديم: الكاشير (expenses.create_own_daily بس) بيشوف مصروفات فرعه هو بس
    const scopedBranchId = req.user.role === "cashier" ? req.user.branchId ?? undefined : branchId;
    const expenses = await this.listExpenses.execute({
      branchId: scopedBranchId,
      businessDate: businessDate ? new Date(businessDate) : undefined,
      status,
    });
    return expenses.map(toPublicExpense);
  }

  @Get(":id")
  @RequirePermission("expenses.view", "expenses.create_own_daily")
  async detail(@Param("id") id: string) {
    return toPublicExpense(await this.getExpense.execute(id));
  }

  // تسجيل مصروف - الكاشير (دور cashier بس) مقفول بالكامل على فرعه/النهاردة، حالته دايمًا SUBMITTED
  // (محتاج مراجعة عبر /review) - نفس فلسفة "المرحلة 7K" بالريبو القديم بالحرف. أي دور تاني بيقدر
  // يحدد status صراحة (DRAFT/SUBMITTED/POSTED)، الافتراضي POSTED (ترحيل فوري زي ما كان دايمًا)
  @Post()
  @RequirePermission("expenses.create", "expenses.create_own_daily")
  async create(@Body() dto: RegisterExpenseDto, @Req() req: Request & { user: AuthenticatedUser }) {
    const isCashier = req.user.role === "cashier";
    const branchId = isCashier ? req.user.branchId ?? dto.branchId : dto.branchId;
    const businessDate = isCashier ? new Date().toISOString().slice(0, 10) : dto.businessDate;
    const requestedStatus = isCashier ? "SUBMITTED" : ((dto.status as "DRAFT" | "SUBMITTED" | "POSTED" | undefined) ?? "POSTED");
    const supplierId = isCashier ? undefined : dto.supplierId;

    return toPublicExpense(
      await this.registerExpense.execute({
        branchId,
        businessDate: new Date(businessDate),
        categoryId: dto.categoryId,
        amount: dto.amount,
        notes: dto.notes,
        supplierId,
        requestedStatus,
        createdBy: req.user.id,
        idempotencyKey: dto.idempotencyKey,
      })
    );
  }

  @Patch(":id")
  @RequirePermission("expenses.create", "expenses.create_own_daily")
  async edit(@Param("id") id: string, @Body() dto: EditExpenseDto) {
    return toPublicExpense(await this.editExpense.execute({ expenseId: id, ...dto }));
  }

  @Post(":id/submit")
  @RequirePermission("expenses.create", "expenses.create_own_daily")
  async submit(@Param("id") id: string) {
    return toPublicExpense(await this.submitExpense.execute({ expenseId: id }));
  }

  // SUBMITTED -> POSTED مباشرة (اعتماد+ترحيل في خطوة واحدة) - نفس مسار /review بالريبو القديم
  @Post(":id/review")
  @RequirePermission("expenses.review", "expenses.manage")
  async review(@Param("id") id: string, @Req() req: Request & { user: AuthenticatedUser }) {
    return toPublicExpense(await this.reviewExpense.execute({ expenseId: id, reviewedBy: req.user.id }));
  }

  @Post(":id/cancel")
  @RequirePermission("expenses.create", "expenses.create_own_daily")
  async cancel(@Param("id") id: string, @Body() dto: CancelExpenseDto, @Req() req: Request & { user: AuthenticatedUser }) {
    return toPublicExpense(await this.cancelExpense.execute({ expenseId: id, cancelledBy: req.user.id, reason: dto.reason }));
  }
}

function toPublicCategory(category: ExpenseCategory) {
  return {
    id: category.id,
    name: category.name,
    isActive: category.isActive,
    alertThreshold: category.alertThreshold,
    accountId: category.accountId,
  };
}

function toPublicExpense(expense: Expense) {
  return {
    id: expense.id,
    branchId: expense.branchId,
    businessDate: expense.businessDate,
    categoryId: expense.categoryId,
    amount: expense.amount,
    notes: expense.notes,
    supplierId: expense.supplierId,
    status: expense.status,
    createdBy: expense.createdBy,
    postedBy: expense.postedBy,
    postedAt: expense.postedAt,
    journalEntryId: expense.journalEntryId,
    cancelledBy: expense.cancelledBy,
    cancelledAt: expense.cancelledAt,
    cancellationReason: expense.cancellationReason,
    createdAt: expense.createdAt,
  };
}
