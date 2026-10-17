import { Body, Controller, Get, Inject, Param, Post, Query, Req, UseFilters, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { GetBranchDayStatusHandler } from "../application/queries/get-branch-day-status.handler";
import { CloseBranchDayHandler } from "../application/commands/close-branch-day.handler";
import { ListBranchDayHistoryHandler } from "../application/queries/list-branch-day-history.handler";
import { CloseBranchDayDto } from "./dto/close-branch-day.dto";
import { JwtAuthGuard } from "../../identity-access/api/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../identity-access/api/guards/permissions.guard";
import { RequirePermission } from "../../identity-access/api/guards/require-permission.decorator";
import type { AuthenticatedUser } from "../../identity-access/api/types";
import { USER_REPOSITORY, type UserRepositoryPort } from "../../identity-access/domain/ports/user-repository.port";
import { BranchScopeGuard, BranchScoped } from "../../../shared/authorization/branch-scope";
import { cappedPage, listResponse, ListQueryDto, splitListQuery } from "../../../shared/http/list-query.dto";
import { BranchDayDomainErrorFilter } from "./filters/domain-error.filter";
import type { BranchDay } from "../domain/branch-day.aggregate";
import { PERMISSION } from "../../identity-access/domain/permission";

@Controller("branch-days")
@UseGuards(JwtAuthGuard, PermissionsGuard, BranchScopeGuard)
@BranchScoped()
@UseFilters(BranchDayDomainErrorFilter)
export class BranchDayController {
  constructor(
    private readonly getStatus: GetBranchDayStatusHandler,
    private readonly closeBranchDay: CloseBranchDayHandler,
    private readonly listHistory: ListBranchDayHistoryHandler,
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort
  ) {}

  @Get(":branchId/status")
  @RequirePermission(PERMISSION.BRANCH_DAY_VIEW, PERMISSION.BRANCH_DAY_CLOSE)
  async status(@Param("branchId") branchId: string, @Query("businessDate") businessDate?: string) {
    return this.getStatus.execute(branchId, businessDate);
  }

  @Post(":branchId/close")
  @RequirePermission(PERMISSION.BRANCH_DAY_CLOSE)
  async close(
    @Param("branchId") branchId: string,
    @Body() dto: CloseBranchDayDto,
    @Req() req: Request & { user: AuthenticatedUser }
  ) {
    return toPublic(
      await this.closeBranchDay.execute({
        branchId,
        closedBy: req.user.id,
        businessDate: dto.businessDate,
        managerNotes: dto.managerNotes,
      })
    );
  }

  @Get(":branchId/history")
  @RequirePermission(PERMISSION.BRANCH_DAY_VIEW, PERMISSION.BRANCH_DAY_CLOSE)
  async history(@Param("branchId") branchId: string, @Query() query: ListQueryDto) {
    const { page } = splitListQuery(query);
    // unpaged: the latest 90 days, as before NEO-6
    const { days, total } = await this.listHistory.execute(branchId, cappedPage(query, page, 90, 90));
    const closerIds = [...new Set(days.map((d) => d.closedBy))];
    const closers = await Promise.all(closerIds.map((id) => this.users.findById(id)));
    const nameById = new Map(closers.filter((u): u is NonNullable<typeof u> => u !== null).map((u) => [u.id, u.name]));
    return listResponse(
      days.map((d) => ({ ...toPublic(d), closedByName: nameById.get(d.closedBy) ?? null })),
      total,
      page
    );
  }
}

function toPublic(branchDay: BranchDay) {
  return {
    id: branchDay.id,
    branchId: branchDay.branchId,
    businessDate: branchDay.businessDate,
    closedBy: branchDay.closedBy,
    closedAt: branchDay.closedAt,
    totalSales: branchDay.totalSales,
    orderCount: branchDay.orderCount,
    cashVarianceTotal: branchDay.cashVarianceTotal,
    managerNotes: branchDay.managerNotes,
  };
}
