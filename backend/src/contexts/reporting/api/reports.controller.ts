import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { GetDashboardSummaryHandler } from "../application/queries/get-dashboard-summary.handler";
import { GetFoodCostReportHandler } from "../application/queries/get-food-cost-report.handler";
import { GetActionCenterHandler } from "../application/queries/get-action-center.handler";
import { GetBranchHealthHandler } from "../application/queries/get-branch-health.handler";
import { GetSalesOpsReportsHandler } from "../application/queries/get-sales-ops-reports.handler";
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
    private readonly getBranchHealth: GetBranchHealthHandler,
    private readonly getSalesOps: GetSalesOpsReportsHandler
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

  private effectiveBranchId(req: Request & { user: AuthenticatedUser }, branchId: string | undefined): string | null {
    return req.user.role === "branch_manager" ? req.user.branchId : (branchId ?? null);
  }

  // ملخّص يومي لكل فرع - عدد الطلبات والإيراد لكل يوم في المدى
  @Get("daily")
  @RequirePermission("reports.view")
  async daily(
    @Query("branchId") branchId: string | undefined,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @Req() req: Request & { user: AuthenticatedUser }
  ) {
    return this.getSalesOps.daily({ branchId: this.effectiveBranchId(req, branchId), from, to });
  }

  // تفصيل المبيعات: الملخّص + حسب طريقة الدفع + حسب نوع الطلب + الاتجاه اليومي
  @Get("sales-detail")
  @RequirePermission("reports.view")
  async salesDetail(
    @Query("branchId") branchId: string | undefined,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @Req() req: Request & { user: AuthenticatedUser }
  ) {
    return this.getSalesOps.salesDetail({ branchId: this.effectiveBranchId(req, branchId), from, to });
  }

  // الطلبات الملغاة في المدى - العدد والقيمة الإجمالية + القائمة التفصيلية
  @Get("cancelled-orders")
  @RequirePermission("reports.view")
  async cancelledOrders(
    @Query("branchId") branchId: string | undefined,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @Req() req: Request & { user: AuthenticatedUser }
  ) {
    return this.getSalesOps.cancelledOrders({ branchId: this.effectiveBranchId(req, branchId), from, to });
  }

  // الطلبات اللي فضلت "بتتحضّر" أكتر من الحد المسموح (افتراضيًا 45 دقيقة)
  @Get("delays")
  @RequirePermission("reports.view")
  async delays(
    @Query("branchId") branchId: string | undefined,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @Query("thresholdMinutes") thresholdMinutes: string | undefined,
    @Req() req: Request & { user: AuthenticatedUser }
  ) {
    return this.getSalesOps.delays({
      branchId: this.effectiveBranchId(req, branchId),
      from,
      to,
      thresholdMinutes: thresholdMinutes ? Number(thresholdMinutes) : undefined,
    });
  }

  // أداء الأصناف: الأكثر/الأقل مبيعًا، والأقل ربحًا
  @Get("item-performance")
  @RequirePermission("reports.view")
  async itemPerformance(
    @Query("branchId") branchId: string | undefined,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @Query("limit") limit: string | undefined,
    @Req() req: Request & { user: AuthenticatedUser }
  ) {
    return this.getSalesOps.itemPerformance({
      branchId: this.effectiveBranchId(req, branchId),
      from,
      to,
      limit: limit ? Number(limit) : undefined,
    });
  }

  // كل أصناف المنيو (حتى اللي مبيعتش) مع مبيعاتها في المدى - عشان مراجعة إيه اللي محتاج يتشال
  @Get("catalog")
  @RequirePermission("reports.view")
  async catalog(
    @Query("branchId") branchId: string | undefined,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @Req() req: Request & { user: AuthenticatedUser }
  ) {
    return this.getSalesOps.catalog({ branchId: this.effectiveBranchId(req, branchId), from, to });
  }

  // كل الوصفات (مكوّناتها وتكلفتها) - لمراجعة جودة البيانات (وصفة ناقصة/مكوّن من غير تكلفة)
  @Get("recipes")
  @RequirePermission("reports.view")
  async recipes() {
    return this.getSalesOps.recipes();
  }
}
