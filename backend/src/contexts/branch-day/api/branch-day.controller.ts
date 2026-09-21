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
import { BranchDayDomainErrorFilter } from "./filters/domain-error.filter";
import type { BranchDay } from "../domain/branch-day.aggregate";

@Controller("branch-days")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseFilters(BranchDayDomainErrorFilter)
export class BranchDayController {
  constructor(
    private readonly getStatus: GetBranchDayStatusHandler,
    private readonly closeBranchDay: CloseBranchDayHandler,
    private readonly listHistory: ListBranchDayHistoryHandler,
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort
  ) {}

  @Get(":branchId/status")
  @RequirePermission("branch_day.view", "branch_day.close")
  async status(@Param("branchId") branchId: string, @Query("businessDate") businessDate?: string) {
    return this.getStatus.execute(branchId, businessDate);
  }

  @Post(":branchId/close")
  @RequirePermission("branch_day.close")
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
  @RequirePermission("branch_day.view", "branch_day.close")
  async history(@Param("branchId") branchId: string) {
    const days = await this.listHistory.execute(branchId);
    const closerIds = [...new Set(days.map((d) => d.closedBy))];
    const closers = await Promise.all(closerIds.map((id) => this.users.findById(id)));
    const nameById = new Map(closers.filter((u): u is NonNullable<typeof u> => u !== null).map((u) => [u.id, u.name]));
    return days.map((d) => ({ ...toPublic(d), closedByName: nameById.get(d.closedBy) ?? null }));
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
