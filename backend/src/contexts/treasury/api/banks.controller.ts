import { Body, Controller, Get, Param, Patch, Post, UseFilters, UseGuards } from "@nestjs/common";
import { RegisterBankHandler } from "../application/commands/register-bank.handler";
import { UpdateBankHandler } from "../application/commands/update-bank.handler";
import { RegisterBankAccountHandler } from "../application/commands/register-bank-account.handler";
import { UpdateBankAccountHandler } from "../application/commands/update-bank-account.handler";
import { ListBanksHandler } from "../application/queries/list-banks.handler";
import { ListBankAccountsHandler } from "../application/queries/list-bank-accounts.handler";
import { RegisterBankDto } from "./dto/register-bank.dto";
import { UpdateBankDto } from "./dto/update-bank.dto";
import { RegisterBankAccountDto } from "./dto/register-bank-account.dto";
import { UpdateBankAccountDto } from "./dto/update-bank-account.dto";
import { JwtAuthGuard } from "../../identity-access/api/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../identity-access/api/guards/permissions.guard";
import { RequirePermission } from "../../identity-access/api/guards/require-permission.decorator";
import { TreasuryDomainErrorFilter } from "./filters/domain-error.filter";
import type { Bank } from "../domain/bank.aggregate";

@Controller("banks")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseFilters(TreasuryDomainErrorFilter)
export class BanksController {
  constructor(
    private readonly registerBank: RegisterBankHandler,
    private readonly updateBank: UpdateBankHandler,
    private readonly registerBankAccount: RegisterBankAccountHandler,
    private readonly updateBankAccount: UpdateBankAccountHandler,
    private readonly listBanks: ListBanksHandler,
    private readonly listBankAccounts: ListBankAccountsHandler
  ) {}

  @Get()
  @RequirePermission("banks.view")
  async list() {
    return (await this.listBanks.execute()).map(toPublicBank);
  }

  @Post()
  @RequirePermission("banks.manage")
  async create(@Body() dto: RegisterBankDto) {
    return toPublicBank(await this.registerBank.execute(dto));
  }

  @Patch(":id")
  @RequirePermission("banks.manage")
  async update(@Param("id") id: string, @Body() dto: UpdateBankDto) {
    return toPublicBank(await this.updateBank.execute({ bankId: id, ...dto }));
  }

  @Get("accounts")
  @RequirePermission("banks.view")
  async accounts() {
    return this.listBankAccounts.execute();
  }

  @Post("accounts")
  @RequirePermission("banks.manage")
  async createAccount(@Body() dto: RegisterBankAccountDto) {
    const bankAccount = await this.registerBankAccount.execute(dto);
    return { id: bankAccount.id, bankId: bankAccount.bankId, treasuryId: bankAccount.treasuryId };
  }

  @Patch("accounts/:id")
  @RequirePermission("banks.manage")
  async updateAccount(@Param("id") id: string, @Body() dto: UpdateBankAccountDto) {
    const bankAccount = await this.updateBankAccount.execute({ bankAccountId: id, ...dto });
    return {
      id: bankAccount.id, bankId: bankAccount.bankId, treasuryId: bankAccount.treasuryId,
      accountNumber: bankAccount.accountNumber, iban: bankAccount.iban,
      bankBranchName: bankAccount.bankBranchName, notes: bankAccount.notes, isActive: bankAccount.isActive,
    };
  }
}

function toPublicBank(bank: Bank) {
  return { id: bank.id, name: bank.name, isActive: bank.isActive };
}
