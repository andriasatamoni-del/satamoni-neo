import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { GetDashboardSummaryHandler } from "../application/queries/get-dashboard-summary.handler";
import { GetFoodCostReportHandler } from "../application/queries/get-food-cost-report.handler";
import { GetActionCenterHandler } from "../application/queries/get-action-center.handler";
import { GetBranchHealthHandler } from "../application/queries/get-branch-health.handler";
import { JwtAuthGuard } from "../../identity-access/api/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../identity-access/api/guards/permissions.guard";
import { RequirePermission } from "../../identity-access/api/guards/require-permission.decorator";
import type { AuthenticatedUser } from "../../identity-access/api/types";

@Controller("reports")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReportsController {
  constructor(
    private readonly getDashboardSummary: GetDashboardSummaryHandler,
    private readonly getFoodCostReport: GetFoodCostReportHandler,
    private readonly getActionCenter: GetActionCenterHandler,
    private readonly getBranchHealth: GetBranchHealthHandler
  ) {}

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

  // تكلفة الطعام: النظري (المستهلك حسب الوصفة) مقابل الفعلي (بعد تصحيحات الجرد/إلغاء الطلبات) لكل صنف
  @Get("food-cost")
  @RequirePermission("reports.view")
  async foodCost(
    @Query("branchId") branchId: string | undefined,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @Req() req: Request & { user: AuthenticatedUser }
  ) {
    const effectiveBranchId = req.user.role === "branch_manager" ? req.user.branchId : (branchId ?? null);
    return this.getFoodCostReport.execute({ branchId: effectiveBranchId, from, to });
  }

  // نفس تقرير تكلفة الطعام لكن مجمّع على مستوى كل فرع - أساس بطاقة صحة الفروع (Branch Health) لاحقًا
  @Get("food-cost/by-branch")
  @RequirePermission("reports.view")
  async foodCostByBranch(@Query("from") from: string | undefined, @Query("to") to: string | undefined) {
    return this.getFoodCostReport.executeByBranch({ from, to });
  }

  // مركز التنبيهات - نقطة واحدة تجمّع كل استثناء يستاهل انتباه فوري (مخزون سالب/دفعات من غير مطابقة/
  // فرق تصنيع/مصروف متجاوز الحد/فرق تكلفة طعام/فاتورة مورد متأخرة/شكوى عميل فاضلة) بدل ما يتفتح كل
  // تقرير لوحده كل يوم
  @Get("action-center")
  @RequirePermission("reports.view")
  async actionCenter(
    @Query("branchId") branchId: string | undefined,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @Req() req: Request & { user: AuthenticatedUser }
  ) {
    const effectiveBranchId = req.user.role === "branch_manager" ? req.user.branchId : (branchId ?? null);
    return this.getActionCenter.execute({ branchId: effectiveBranchId, from, to });
  }

  // بطاقة صحة الفروع - مقارنة كل الفروع في مكان واحد (إيراد/تكلفة طعام%/فرق كاش/مخزون سالب/شكاوى)،
  // أدمن/محاسب بس (نفس نطاق الريبو القديم - المقارنة الشاملة بين الفروع مش حاجة مدير فرع واحد يحتاجها)
  @Get("branch-health")
  @RequirePermission("reports.branch_health")
  async branchHealth(@Query("from") from: string | undefined, @Query("to") to: string | undefined) {
    return this.getBranchHealth.execute({ from, to });
  }
}
