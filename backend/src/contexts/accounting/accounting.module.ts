import { Module, OnModuleInit } from "@nestjs/common";
import { PermissionRegistry } from "../../shared/permissions/permission-registry";
import { EventBusService } from "../../shared/events/event-bus.service";
import { IdentityAccessModule } from "../identity-access/identity-access.module";
import { ACCOUNT_REPOSITORY } from "./domain/ports/account-repository.port";
import { JOURNAL_ENTRY_REPOSITORY } from "./domain/ports/journal-entry-repository.port";
import { KyselyAccountRepository } from "./infrastructure/persistence/kysely-account.repository";
import { KyselyJournalEntryRepository } from "./infrastructure/persistence/kysely-journal-entry.repository";
import { RegisterAccountHandler } from "./application/commands/register-account.handler";
import { RegisterJournalEntryHandler } from "./application/commands/register-journal-entry.handler";
import { ReverseJournalEntryHandler } from "./application/commands/reverse-journal-entry.handler";
import { PostOrderSaleJournalEntryHandler } from "./application/commands/post-order-sale-journal-entry.handler";
import { PostPayrollJournalEntryHandler } from "./application/commands/post-payroll-journal-entry.handler";
import { PostShiftVarianceJournalEntryHandler } from "./application/commands/post-shift-variance-journal-entry.handler";
import { PostGoodsReceiptApJournalEntryHandler } from "./application/commands/post-goods-receipt-ap-journal-entry.handler";
import { PostDriverSettlementVarianceJournalEntryHandler } from "./application/commands/post-driver-settlement-variance-journal-entry.handler";
import { PostDriverWageJournalEntryHandler } from "./application/commands/post-driver-wage-journal-entry.handler";
import { PostStocktakeVarianceJournalEntryHandler } from "./application/commands/post-stocktake-variance-journal-entry.handler";
import { PostConversionOrderJournalEntryHandler } from "./application/commands/post-conversion-order-journal-entry.handler";
import { ListAccountsHandler } from "./application/queries/list-accounts.handler";
import { ListJournalEntriesHandler } from "./application/queries/list-journal-entries.handler";
import { AccountingController } from "./api/accounting.controller";
import type { OrderRegisteredEvent } from "../orders/domain/events/order-registered.event";
import type { PayrollRunApprovedEvent } from "../hr-payroll/domain/events/payroll-run-approved.event";
import type { ShiftClosedEvent } from "../shifts/domain/events/shift-closed.event";
import type { GoodsReceiptConfirmedEvent } from "../procurement/domain/events/goods-receipt-confirmed.event";
import type { DriverSettlementCreatedEvent } from "../delivery/domain/events/driver-settlement-created.event";
import type { DriverAttendanceShiftClosedEvent } from "../delivery/domain/events/driver-attendance-shift-closed.event";
import type { StocktakeCommittedEvent } from "../inventory/domain/events/stocktake-committed.event";
import type { ConversionOrderCompletedEvent } from "../production/domain/events/conversion-order-completed.event";

@Module({
  imports: [IdentityAccessModule],
  controllers: [AccountingController],
  providers: [
    { provide: ACCOUNT_REPOSITORY, useClass: KyselyAccountRepository },
    { provide: JOURNAL_ENTRY_REPOSITORY, useClass: KyselyJournalEntryRepository },
    RegisterAccountHandler,
    RegisterJournalEntryHandler,
    ReverseJournalEntryHandler,
    PostOrderSaleJournalEntryHandler,
    PostPayrollJournalEntryHandler,
    PostShiftVarianceJournalEntryHandler,
    PostGoodsReceiptApJournalEntryHandler,
    PostDriverSettlementVarianceJournalEntryHandler,
    PostDriverWageJournalEntryHandler,
    PostStocktakeVarianceJournalEntryHandler,
    PostConversionOrderJournalEntryHandler,
    ListAccountsHandler,
    ListJournalEntriesHandler,
  ],
  exports: [ACCOUNT_REPOSITORY, JOURNAL_ENTRY_REPOSITORY, RegisterJournalEntryHandler, ReverseJournalEntryHandler],
})
export class AccountingModule implements OnModuleInit {
  constructor(
    private readonly permissions: PermissionRegistry,
    private readonly eventBus: EventBusService,
    private readonly postOrderSaleJournalEntry: PostOrderSaleJournalEntryHandler,
    private readonly postPayrollJournalEntry: PostPayrollJournalEntryHandler,
    private readonly postShiftVarianceJournalEntry: PostShiftVarianceJournalEntryHandler,
    private readonly postGoodsReceiptApJournalEntry: PostGoodsReceiptApJournalEntryHandler,
    private readonly postDriverSettlementVarianceJournalEntry: PostDriverSettlementVarianceJournalEntryHandler,
    private readonly postDriverWageJournalEntry: PostDriverWageJournalEntryHandler,
    private readonly postStocktakeVarianceJournalEntry: PostStocktakeVarianceJournalEntryHandler,
    private readonly postConversionOrderJournalEntry: PostConversionOrderJournalEntryHandler
  ) {}

  onModuleInit(): void {
    this.permissions.registerGroup({
      group: "accounting",
      groupLabel: "الحسابات",
      permissions: [
        { key: "accounting.view", label: "رؤية الحسابات والقيود" },
        { key: "accounting.manage", label: "إدارة الحسابات وتسجيل القيود" },
      ],
    });
    this.permissions.setRoleDefaults("accountant", ["accounting.view", "accounting.manage"]);

    // أول استخدام حقيقي لـEventBusService في النظام - Accounting بيشترك في حدث Orders من غير ما
    // Orders يعرف حاجة عن وجود Accounting أصلًا (نفس فايدة الفصل اللي الـbus اتصمم لأجلها من الأول)
    this.eventBus.subscribe<OrderRegisteredEvent>("OrderRegistered", (event) =>
      this.postOrderSaleJournalEntry.handle(event)
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
  }
}
