import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { GetDashboardSummaryHandler } from "../application/queries/get-dashboard-summary.handler";
import { JwtAuthGuard } from "../../identity-access/api/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../identity-access/api/guards/permissions.guard";
import { RequirePermission } from "../../identity-access/api/guards/require-permission.decorator";
import type { AuthenticatedUser } from "../../identity-access/api/types";

@Controller("reports")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReportsController {
  constructor(private readonly getDashboardSummary: GetDashboardSummaryHandler) {}

  @Get("dashboard")
  @RequirePermission("reports.view")
  async dashboard(
    @Query("branchId") branchId: string | undefined,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @Req() req: Request & { user: AuthenticatedUser }
  ) {
    // نفس نطاق الريبو القديم بالظبط: مدير الفرع مقفول على فرعه، أدمن ومحاسب يقدروا يشوفوا أي فرع
    // (أو كل الفروع سوا لو معندهمش فلتر) - راجع docs بحث الـReports
    const effectiveBranchId = req.user.role === "branch_manager" ? req.user.branchId : (branchId ?? null);
    return this.getDashboardSummary.execute({ branchId: effectiveBranchId, from, to });
  }
}
