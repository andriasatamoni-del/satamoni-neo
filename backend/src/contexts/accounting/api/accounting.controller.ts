import { Body, Controller, Get, Param, Post, Query, Req, UseFilters, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { RegisterAccountHandler } from "../application/commands/register-account.handler";
import { RegisterJournalEntryHandler } from "../application/commands/register-journal-entry.handler";
import { ReverseJournalEntryHandler } from "../application/commands/reverse-journal-entry.handler";
import { ListAccountsHandler } from "../application/queries/list-accounts.handler";
import { ListJournalEntriesHandler } from "../application/queries/list-journal-entries.handler";
import { RegisterAccountDto } from "./dto/register-account.dto";
import { RegisterJournalEntryDto } from "./dto/register-journal-entry.dto";
import { ReverseJournalEntryDto } from "./dto/reverse-journal-entry.dto";
import { JwtAuthGuard } from "../../identity-access/api/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../identity-access/api/guards/permissions.guard";
import { RequirePermission } from "../../identity-access/api/guards/require-permission.decorator";
import type { AuthenticatedUser } from "../../identity-access/api/types";
import { AccountingDomainErrorFilter } from "./filters/domain-error.filter";
import type { Account } from "../domain/account.aggregate";
import type { JournalEntry } from "../domain/journal-entry.aggregate";

@Controller("accounting")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseFilters(AccountingDomainErrorFilter)
export class AccountingController {
  constructor(
    private readonly registerAccount: RegisterAccountHandler,
    private readonly registerJournalEntry: RegisterJournalEntryHandler,
    private readonly reverseJournalEntry: ReverseJournalEntryHandler,
    private readonly listAccounts: ListAccountsHandler,
    private readonly listJournalEntries: ListJournalEntriesHandler
  ) {}

  @Get("accounts")
  @RequirePermission("accounting.view", "accounting.manage")
  async accounts() {
    return (await this.listAccounts.execute()).map(toPublicAccount);
  }

  @Post("accounts")
  @RequirePermission("accounting.manage")
  async createAccount(@Body() dto: RegisterAccountDto) {
    return toPublicAccount(await this.registerAccount.execute(dto));
  }

  @Get("journal-entries")
  @RequirePermission("accounting.view", "accounting.manage")
  async journalEntries(@Query("branchId") branchId?: string, @Query("sourceType") sourceType?: string) {
    return (await this.listJournalEntries.execute({ branchId, sourceType })).map(toPublicEntry);
  }

  @Post("journal-entries")
  @RequirePermission("accounting.manage")
  async createJournalEntry(@Body() dto: RegisterJournalEntryDto, @Req() req: Request & { user: AuthenticatedUser }) {
    return toPublicEntry(
      await this.registerJournalEntry.execute({
        ...dto,
        entryDate: dto.entryDate ? new Date(dto.entryDate) : undefined,
        createdBy: req.user.id,
      })
    );
  }

  @Post("journal-entries/:id/reverse")
  @RequirePermission("accounting.manage")
  async reverse(@Param("id") id: string, @Body() dto: ReverseJournalEntryDto, @Req() req: Request & { user: AuthenticatedUser }) {
    return toPublicEntry(await this.reverseJournalEntry.execute({ entryId: id, reversedBy: req.user.id, reason: dto.reason }));
  }
}

function toPublicAccount(account: Account) {
  return { id: account.id, code: account.code, name: account.name, accountType: account.accountType, isActive: account.isActive };
}

function toPublicEntry(entry: JournalEntry) {
  return {
    id: entry.id,
    entryNumber: entry.entryNumber,
    entryDate: entry.entryDate,
    description: entry.description,
    sourceType: entry.sourceType,
    sourceId: entry.sourceId,
    branchId: entry.branchId,
    status: entry.status,
    lines: entry.lines.map((l) => ({ accountId: l.accountId, debit: l.debit, credit: l.credit, description: l.description })),
    postedAt: entry.postedAt,
    reversedAt: entry.reversedAt,
    reversalOfEntryId: entry.reversalOfEntryId,
    reversalReason: entry.reversalReason,
  };
}
