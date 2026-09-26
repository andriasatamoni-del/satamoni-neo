import { Module, OnModuleInit } from "@nestjs/common";
import { PermissionRegistry } from "../../shared/permissions/permission-registry";
import { EventBusService } from "../../shared/events/event-bus.service";
import { IdentityAccessModule } from "../identity-access/identity-access.module";
import { ACCOUNT_REPOSITORY } from "./domain/ports/account-repository.port";
import { JOURNAL_ENTRY_REPOSITORY } from "./domain/ports/journal-entry-repository.port";
import { ACCOUNTING_REPORTS_READER } from "./domain/ports/accounting-reports-reader.port";
import { ACCOUNTING_PERIOD_REPOSITORY } from "./domain/ports/accounting-period-repository.port";
import { FISCAL_YEAR_CLOSING_REPOSITORY } from "./domain/ports/fiscal-year-closing-repository.port";
import { KyselyAccountRepository } from "./infrastructure/persistence/kysely-account.repository";
import { KyselyJournalEntryRepository } from "./infrastructure/persistence/kysely-journal-entry.repository";
import { KyselyAccountingReportsReader } from "./infrastructure/persistence/kysely-accounting-reports-reader";
import { KyselyAccountingPeriodRepository } from "./infrastructure/persistence/kysely-accounting-period.repository";
import { KyselyFiscalYearClosingRepository } from "./infrastructure/persistence/kysely-fiscal-year-closing.repository";
import { RegisterAccountHandler } from "./application/commands/register-account.handler";
import { RegisterJournalEntryHandler } from "./application/commands/register-journal-entry.handler";
import { PostJournalEntryHandler } from "./application/commands/post-journal-entry.handler";
import { ReverseJournalEntryHandler } from "./application/commands/reverse-journal-entry.handler";
import { ClosePeriodHandler } from "./application/commands/close-period.handler";
import { CloseFiscalYearHandler } from "./application/commands/close-fiscal-year.handler";
import { PostOrderSaleJournalEntryHandler } from "./application/commands/post-order-sale-journal-entry.handler";
import { PostOrderCancellationJournalEntryHandler } from "./application/commands/post-order-cancellation-journal-entry.handler";
import { PostPayrollJournalEntryHandler } from "./application/commands/post-payroll-journal-entry.handler";
import { PostShiftVarianceJournalEntryHandler } from "./application/commands/post-shift-variance-journal-entry.handler";
import { PostGoodsReceiptApJournalEntryHandler } from "./application/commands/post-goods-receipt-ap-journal-entry.handler";
import { PostDriverSettlementVarianceJournalEntryHandler } from "./application/commands/post-driver-settlement-variance-journal-entry.handler";
import { PostDriverWageJournalEntryHandler } from "./application/commands/post-driver-wage-journal-entry.handler";
import { PostStocktakeVarianceJournalEntryHandler } from "./application/commands/post-stocktake-variance-journal-entry.handler";
import { PostConversionOrderJournalEntryHandler } from "./application/commands/post-conversion-order-journal-entry.handler";
import { PostCashDrawerEntryJournalEntryHandler } from "./application/commands/post-cash-drawer-entry-journal-entry.handler";
import { PostPurchaseJournalEntryHandler } from "./application/commands/post-purchase-journal-entry.handler";
import { ListAccountsHandler } from "./application/queries/list-accounts.handler";
import { ListJournalEntriesHandler } from "./application/queries/list-journal-entries.handler";
import { GetTrialBalanceHandler } from "./application/queries/get-trial-balance.handler";
import { GetGeneralLedgerHandler } from "./application/queries/get-general-ledger.handler";
import { GetIncomeStatementHandler } from "./application/queries/get-income-statement.handler";
import { ListPeriodsHandler } from "./application/queries/list-periods.handler";
import { ListFiscalYearClosingsHandler } from "./application/queries/list-fiscal-year-closings.handler";
import { AccountingController } from "./api/accounting.controller";
import type { OrderRegisteredEvent } from "../orders/domain/events/order-registered.event";
import type { OrderCancelledEvent } from "../orders/domain/events/order-cancelled.event";
import type { PayrollRunApprovedEvent } from "../hr-payroll/domain/events/payroll-run-approved.event";
import type { ShiftClosedEvent } from "../shifts/domain/events/shift-closed.event";
import type { CashDrawerEntryRegisteredEvent } from "../shifts/domain/events/cash-drawer-entry-registered.event";
import type { GoodsReceiptConfirmedEvent } from "../procurement/domain/events/goods-receipt-confirmed.event";
import type { DriverSettlementCreatedEvent } from "../delivery/domain/events/driver-settlement-created.event";
import type { DriverAttendanceShiftClosedEvent } from "../delivery/domain/events/driver-attendance-shift-closed.event";
import type { StocktakeCommittedEvent } from "../inventory/domain/events/stocktake-committed.event";
import type { ConversionOrderCompletedEvent } from "../production/domain/events/conversion-order-completed.event";
import type { PurchaseConfirmedEvent } from "../purchases/domain/events/purchase-confirmed.event";

@Module({
  imports: [IdentityAccessModule],
  controllers: [AccountingController],
  providers: [
    { provide: ACCOUNT_REPOSITORY, useClass: KyselyAccountRepository },
    { provide: JOURNAL_ENTRY_REPOSITORY, useClass: KyselyJournalEntryRepository },
    { provide: ACCOUNTING_REPORTS_READER, useClass: KyselyAccountingReportsReader },
    { provide: ACCOUNTING_PERIOD_REPOSITORY, useClass: KyselyAccountingPeriodRepository },
    { provide: FISCAL_YEAR_CLOSING_REPOSITORY, useClass: KyselyFiscalYearClosingRepository },
    RegisterAccountHandler,
    RegisterJournalEntryHandler,
    PostJournalEntryHandler,
    ReverseJournalEntryHandler,
    ClosePeriodHandler,
    CloseFiscalYearHandler,
    PostOrderSaleJournalEntryHandler,
    PostOrderCancellationJournalEntryHandler,
    PostPayrollJournalEntryHandler,
    PostShiftVarianceJournalEntryHandler,
    PostGoodsReceiptApJournalEntryHandler,
    PostDriverSettlementVarianceJournalEntryHandler,
    PostDriverWageJournalEntryHandler,
    PostStocktakeVarianceJournalEntryHandler,
    PostConversionOrderJournalEntryHandler,
    PostCashDrawerEntryJournalEntryHandler,
    PostPurchaseJournalEntryHandler,
    ListAccountsHandler,
    ListJournalEntriesHandler,
    GetTrialBalanceHandler,
    GetGeneralLedgerHandler,
    GetIncomeStatementHandler,
    ListPeriodsHandler,
    ListFiscalYearClosingsHandler,
  ],
  exports: [ACCOUNT_REPOSITORY, JOURNAL_ENTRY_REPOSITORY, RegisterJournalEntryHandler, ReverseJournalEntryHandler],
})
export class AccountingModule implements OnModuleInit {
  constructor(
    private readonly permissions: PermissionRegistry,
    private readonly eventBus: EventBusService,
    private readonly postOrderSaleJournalEntry: PostOrderSaleJournalEntryHandler,
    private readonly postOrderCancellationJournalEntry: PostOrderCancellationJournalEntryHandler,
    private readonly postPayrollJournalEntry: PostPayrollJournalEntryHandler,
    private readonly postShiftVarianceJournalEntry: PostShiftVarianceJournalEntryHandler,
    private readonly postGoodsReceiptApJournalEntry: PostGoodsReceiptApJournalEntryHandler,
    private readonly postDriverSettlementVarianceJournalEntry: PostDriverSettlementVarianceJournalEntryHandler,
    private readonly postDriverWageJournalEntry: PostDriverWageJournalEntryHandler,
    private readonly postStocktakeVarianceJournalEntry: PostStocktakeVarianceJournalEntryHandler,
    private readonly postConversionOrderJournalEntry: PostConversionOrderJournalEntryHandler,
    private readonly postCashDrawerEntryJournalEntry: PostCashDrawerEntryJournalEntryHandler,
    private readonly postPurchaseJournalEntry: PostPurchaseJournalEntryHandler
  ) {}

  onModuleInit(): void {
    this.permissions.registerGroup({
      group: "accounting",
      groupLabel: "الحسابات",
      permissions: [
        { key: "accounting.view", label: "رؤية الحسابات والقيود" },
        { key: "accounting.manage", label: "إدارة الحسابات وتسجيل القيود" },
        { key: "accounting.create", label: "تسجيل قيد يدوي (مسودة)" },
        { key: "accounting.post", label: "ترحيل قيد يدوي (مراجعة واعتماد)" },
        { key: "accounting.close_period", label: "قفل شهر محاسبي" },
        { key: "accounting.close_year", label: "قفل سنة مالية" },
      ],
    });
    this.permissions.setRoleDefaults("accountant", [
      "accounting.view",
      "accounting.manage",
      "accounting.create",
      "accounting.post",
      "accounting.close_period",
    ]);
    // قفل السنة المالية أدمن بس (نفس الريبو القديم بالحرف: requireRole("admin") قبل حتى requirePermission)
    // - أثر أعمق وأصعب في التراجع من قفل شهر واحد

    // أول استخدام حقيقي لـEventBusService في النظام - Accounting بيشترك في حدث Orders من غير ما
    // Orders يعرف حاجة عن وجود Accounting أصلًا (نفس فايدة الفصل اللي الـbus اتصمم لأجلها من الأول)
    this.eventBus.subscribe<OrderRegisteredEvent>("OrderRegistered", (event) =>
      this.postOrderSaleJournalEntry.handle(event)
    );
    // اتناشر مستهلك - إلغاء طلب (Talabat أو يدوي) بيعكس قيد البيع التلقائي بتاعه تلقائيًا، من غير ما
    // Orders context يعرف حاجة عن وجود Accounting (نفس فلسفة OrderRegistered بالظبط)
    this.eventBus.subscribe<OrderCancelledEvent>("OrderCancelled", (event) =>
      this.postOrderCancellationJournalEntry.handle(event)
    );
    // تالت مستهلك حقيقي للـevent bus (بعد Accounting نفسه على OrderRegistered) - نفس الفلسفة
    // بالظبط، Accounting هنا بيشترك في حدث HR & Payroll من غير ما HrPayroll يعرف حاجة عن وجوده
    this.eventBus.subscribe<PayrollRunApprovedEvent>("PayrollRunApproved", (event) =>
      this.postPayrollJournalEntry.handle(event)
    );
    // رابع مستهلك - فرق كاش شيفت مقفول (لو موجود) بيترحّل تلقائيًا، من غير ما Shifts context يعرف
    // حاجة عن Accounting
    this.eventBus.subscribe<ShiftClosedEvent>("ShiftClosed", (event) =>
      this.postShiftVarianceJournalEntry.handle(event)
    );
    // خامس مستهلك - استلام بضاعة اتأكد (لو ليه مورد) بيرحّل قيد AP تلقائيًا، من غير ما Procurement
    // يعرف حاجة عن وجود Accounting
    this.eventBus.subscribe<GoodsReceiptConfirmedEvent>("GoodsReceiptConfirmed", (event) =>
      this.postGoodsReceiptApJournalEntry.handle(event)
    );
    // سادس مستهلك - فرق تسليم تسوية سائق (لو موجود) بيترحّل تلقائيًا، من غير ما Delivery context
    // يعرف حاجة عن وجود Accounting
    this.eventBus.subscribe<DriverSettlementCreatedEvent>("DriverSettlementCreated", (event) =>
      this.postDriverSettlementVarianceJournalEntry.handle(event)
    );
    // سابع مستهلك - أجر+بونص شيفت حضور سائق مقفول بيترحّل تلقائيًا كمصروف
    this.eventBus.subscribe<DriverAttendanceShiftClosedEvent>("DriverAttendanceShiftClosed", (event) =>
      this.postDriverWageJournalEntry.handle(event)
    );
    // تامن مستهلك - فروق جرد فعلي (لو موجودة) بيترحّل قيد مستقل لكل سطر تلقائيًا
    this.eventBus.subscribe<StocktakeCommittedEvent>("StocktakeCommitted", (event) =>
      this.postStocktakeVarianceJournalEntry.handle(event)
    );
    // تاسع مستهلك - إكمال أمر تحويل (تصنيع/تعبئة) بيترحّل قيد تحويل قيمة (خام→تام) + فرق إنتاج تلقائيًا
    this.eventBus.subscribe<ConversionOrderCompletedEvent>("ConversionOrderCompleted", (event) =>
      this.postConversionOrderJournalEntry.handle(event)
    );
    // عاشر مستهلك - مصروف/مشترى نقدي اتسجل من درج شيفت شغال بيترحّل تلقائيًا، من غير ما Shifts context
    // يعرف حاجة عن وجود Accounting
    this.eventBus.subscribe<CashDrawerEntryRegisteredEvent>("CashDrawerEntryRegistered", (event) =>
      this.postCashDrawerEntryJournalEntry.handle(event)
    );
    // حداشر مستهلك - مشترى طارئ (PO-less) اتأكد وبيه بنود بترحّل مخزون بيترحّل قيد نقدي تلقائيًا، من
    // غير ما Purchases context يعرف حاجة عن وجود Accounting
    this.eventBus.subscribe<PurchaseConfirmedEvent>("PurchaseConfirmed", (event) =>
      this.postPurchaseJournalEntry.handle(event)
    );
  }
}
