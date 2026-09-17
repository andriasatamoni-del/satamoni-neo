import { Module, OnModuleInit } from "@nestjs/common";
import { PermissionRegistry } from "../../shared/permissions/permission-registry";
import { EventBusService } from "../../shared/events/event-bus.service";
import { IdentityAccessModule } from "../identity-access/identity-access.module";
import { AccountingModule } from "../accounting/accounting.module";
import type { BranchRegisteredEvent } from "../branches/domain/events/branch-registered.event";
import { TREASURY_REPOSITORY } from "./domain/ports/treasury-repository.port";
import { BANK_REPOSITORY } from "./domain/ports/bank-repository.port";
import { BANK_ACCOUNT_REPOSITORY } from "./domain/ports/bank-account-repository.port";
import { TREASURY_BALANCE_READER } from "./domain/ports/treasury-balance-reader.port";
import { KyselyTreasuryRepository } from "./infrastructure/persistence/kysely-treasury.repository";
import { KyselyBankRepository } from "./infrastructure/persistence/kysely-bank.repository";
import { KyselyBankAccountRepository } from "./infrastructure/persistence/kysely-bank-account.repository";
import { KyselyTreasuryBalanceReader } from "./infrastructure/persistence/kysely-treasury-balance-reader";
import { RegisterTreasuryHandler } from "./application/commands/register-treasury.handler";
import { TransferBetweenTreasuriesHandler } from "./application/commands/transfer-between-treasuries.handler";
import { RegisterBankHandler } from "./application/commands/register-bank.handler";
import { UpdateBankHandler } from "./application/commands/update-bank.handler";
import { RegisterBankAccountHandler } from "./application/commands/register-bank-account.handler";
import { UpdateBankAccountHandler } from "./application/commands/update-bank-account.handler";
import { ListTreasuriesHandler } from "./application/queries/list-treasuries.handler";
import { ListBanksHandler } from "./application/queries/list-banks.handler";
import { ListBankAccountsHandler } from "./application/queries/list-bank-accounts.handler";
import { TreasuriesController } from "./api/treasuries.controller";
import { BanksController } from "./api/banks.controller";

@Module({
  imports: [IdentityAccessModule, AccountingModule],
  controllers: [TreasuriesController, BanksController],
  providers: [
    { provide: TREASURY_REPOSITORY, useClass: KyselyTreasuryRepository },
    { provide: BANK_REPOSITORY, useClass: KyselyBankRepository },
    { provide: BANK_ACCOUNT_REPOSITORY, useClass: KyselyBankAccountRepository },
    { provide: TREASURY_BALANCE_READER, useClass: KyselyTreasuryBalanceReader },
    RegisterTreasuryHandler,
    TransferBetweenTreasuriesHandler,
    RegisterBankHandler,
    UpdateBankHandler,
    RegisterBankAccountHandler,
    UpdateBankAccountHandler,
    ListTreasuriesHandler,
    ListBanksHandler,
    ListBankAccountsHandler,
  ],
  exports: [TREASURY_REPOSITORY],
})
export class TreasuryModule implements OnModuleInit {
  constructor(
    private readonly permissions: PermissionRegistry,
    private readonly eventBus: EventBusService,
    private readonly registerTreasury: RegisterTreasuryHandler
  ) {}

  onModuleInit(): void {
    this.permissions.registerGroup({
      group: "treasuries",
      groupLabel: "الخزائن والبنوك",
      permissions: [
        { key: "treasuries.view", label: "رؤية الخزائن وأرصدتها" },
        { key: "treasuries.transfer", label: "تحويل بين الخزائن" },
        { key: "treasuries.manage", label: "إنشاء خزائن رئيسية" },
        { key: "banks.view", label: "رؤية البنوك والحسابات البنكية" },
        { key: "banks.manage", label: "إدارة البنوك والحسابات البنكية" },
      ],
    });
    // نفس نطاق الريبو القديم بالظبط: التحويل بين الخزائن ورؤيتها مالي بحت (مش متاح لمدير الفرع)،
    // البنوك إدارة أدمن بس ورؤية للمحاسب
    this.permissions.setRoleDefaults("accountant", ["treasuries.view", "treasuries.transfer", "treasuries.manage", "banks.view"]);
    this.permissions.setRoleDefaults("branch_manager", ["treasuries.view"]);

    // خزينة رئيسية تلقائية لكل فرع جديد - راجع تعليق BranchRegisteredEvent وRegisterTreasuryHandler
    this.eventBus.subscribe<BranchRegisteredEvent>("BranchRegistered", async (event) => {
      await this.registerTreasury.execute({ name: `خزينة ${event.name} الرئيسية`, kind: "MAIN", branchId: event.branchId });
    });
  }
}
