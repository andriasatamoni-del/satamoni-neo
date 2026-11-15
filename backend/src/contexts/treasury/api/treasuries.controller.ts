import { BadRequestException, Body, Controller, Get, Param, Post, Query, Req, UseFilters, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { RegisterTreasuryHandler } from "../application/commands/register-treasury.handler";
import { TransferBetweenTreasuriesHandler } from "../application/commands/transfer-between-treasuries.handler";
import { ListTreasuriesHandler } from "../application/queries/list-treasuries.handler";
import { RegisterTreasuryDto } from "./dto/register-treasury.dto";
import { TransferBetweenTreasuriesDto } from "./dto/transfer-between-treasuries.dto";
import { JwtAuthGuard } from "../../identity-access/api/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../identity-access/api/guards/permissions.guard";
import { RequirePermission } from "../../identity-access/api/guards/require-permission.decorator";
import type { AuthenticatedUser } from "../../identity-access/api/types";
import { BranchScopeGuard, BranchScoped, BranchResources, branchScopeOf } from "../../../shared/authorization/branch-scope";
import { TreasuryDomainErrorFilter } from "./filters/domain-error.filter";
import type { JournalEntry } from "../../accounting/domain/journal-entry.aggregate";
import type { Treasury } from "../domain/treasury.aggregate";
import { PERMISSION } from "../../identity-access/domain/permission";
import { ListQueryDto, listResponse, pageOfRows, pageRequestOf } from "../../../shared/http/list-query.dto";

@Controller("treasuries")
@UseGuards(JwtAuthGuard, PermissionsGuard, BranchScopeGuard)
@UseFilters(TreasuryDomainErrorFilter)
export class TreasuriesController {
  constructor(
    private readonly registerTreasury: RegisterTreasuryHandler,
    private readonly transferBetweenTreasuries: TransferBetweenTreasuriesHandler,
    private readonly listTreasuries: ListTreasuriesHandler
  ) {}

  @BranchScoped()
  @Get()
  @RequirePermission(PERMISSION.TREASURIES_VIEW)
  async list(@Query("branchId") branchId: string | undefined, @Query() query: ListQueryDto, @Req() req: Request & { user: AuthenticatedUser }) {
    const page = pageRequestOf(query);
    const isBranchScoped = branchScopeOf(req.user).kind !== "all";
    const effectiveBranchId = isBranchScoped ? req.user.branchId : (branchId ?? null);
    if (isBranchScoped && !effectiveBranchId) {
      throw new BadRequestException("لازم تحدد الفرع");
    }
    const rows = await this.listTreasuries.execute(effectiveBranchId ? { branchId: effectiveBranchId } : undefined);
    return listResponse(pageOfRows(rows, page), rows.length, page);
  }

  @BranchScoped()
  @Post()
  @RequirePermission(PERMISSION.TREASURIES_MANAGE)
  async create(@Body() dto: RegisterTreasuryDto) {
    const treasury = await this.registerTreasury.execute({ name: dto.name, kind: "MAIN", branchId: dto.branchId });
    return toPublicTreasury(treasury);
  }

  @BranchScoped()
  @BranchResources(["treasuries"], ["treasuries", { param: "toTreasuryId", from: "body" }])
  @Post(":id/transfer")
  @RequirePermission(PERMISSION.TREASURIES_TRANSFER)
  async transfer(@Param("id") id: string, @Body() dto: TransferBetweenTreasuriesDto, @Req() req: Request & { user: AuthenticatedUser }) {
    const entry = await this.transferBetweenTreasuries.execute({
      fromTreasuryId: id,
      toTreasuryId: dto.toTreasuryId,
      amount: dto.amount,
      notes: dto.notes,
      createdBy: req.user.id,
    });
    return toPublicEntry(entry);
  }
}

function toPublicTreasury(treasury: Treasury) {
  return { id: treasury.id, name: treasury.name, kind: treasury.kind, branchId: treasury.branchId, accountId: treasury.accountId };
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
    lines: entry.lines.map((l) => ({ accountId: l.accountId, debit: l.debit, credit: l.credit })),
    postedAt: entry.postedAt,
  };
}
