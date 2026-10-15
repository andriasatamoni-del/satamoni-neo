import { Module, OnModuleInit } from "@nestjs/common";
import { EventBusService } from "../../shared/events/event-bus.service";
import { IdentityAccessModule } from "../identity-access/identity-access.module";
import { AccountingModule } from "../accounting/accounting.module";
import type { BranchRegisteredEvent } from "../branches/domain/events/branch-registered.event";
import { TREASURY_REPOSITORY } from "./domain/ports/treasury-repository.port";
import { BANK_REPOSITORY } from "./domain/ports/bank-repository.port";
import { BANK_ACCOUNT_REPOSITORY } from "./domain/ports/bank-account-repository.port";
import { TREASURY_BALANCE_READER } from "./domain/ports/treasury-balance-reader.port";
import { TreasuryRepository } from "./infrastructure/persistence/treasury.repository";
import { BankRepository } from "./infrastructure/persistence/bank.repository";
import { BankAccountRepository } from "./infrastructure/persistence/bank-account.repository";
import { TreasuryBalanceReader } from "./infrastructure/persistence/treasury-balance-reader";
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
    { provide: TREASURY_REPOSITORY, useClass: TreasuryRepository },
    { provide: BANK_REPOSITORY, useClass: BankRepository },
    { provide: BANK_ACCOUNT_REPOSITORY, useClass: BankAccountRepository },
    { provide: TREASURY_BALANCE_READER, useClass: TreasuryBalanceReader },
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
    private readonly eventBus: EventBusService,
    private readonly registerTreasury: RegisterTreasuryHandler
  ) {}

  onModuleInit(): void {
    // خزينة رئيسية تلقائية لكل فرع جديد - راجع تعليق BranchRegisteredEvent وRegisterTreasuryHandler
    this.eventBus.subscribe<BranchRegisteredEvent>("BranchRegistered", async (event) => {
      await this.registerTreasury.execute({ name: `خزينة ${event.name} الرئيسية`, kind: "MAIN", branchId: event.branchId });
    });
  }
}
