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
import { ListAccountsHandler } from "./application/queries/list-accounts.handler";
import { ListJournalEntriesHandler } from "./application/queries/list-journal-entries.handler";
import { AccountingController } from "./api/accounting.controller";
import type { OrderRegisteredEvent } from "../orders/domain/events/order-registered.event";

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
    ListAccountsHandler,
    ListJournalEntriesHandler,
  ],
  exports: [ACCOUNT_REPOSITORY, JOURNAL_ENTRY_REPOSITORY],
})
export class AccountingModule implements OnModuleInit {
  constructor(
    private readonly permissions: PermissionRegistry,
    private readonly eventBus: EventBusService,
    private readonly postOrderSaleJournalEntry: PostOrderSaleJournalEntryHandler
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
  }
}
