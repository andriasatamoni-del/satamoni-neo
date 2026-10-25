import { BadRequestException, Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { GetDashboardSummaryHandler } from "../application/queries/get-dashboard-summary.handler";
import { GetFoodCostReportHandler } from "../application/queries/get-food-cost-report.handler";
import { GetActionCenterHandler } from "../application/queries/get-action-center.handler";
import { GetBranchHealthHandler } from "../application/queries/get-branch-health.handler";
import { GetSalesOpsReportsHandler } from "../application/queries/get-sales-ops-reports.handler";
import { GetInventoryReportsHandler } from "../application/queries/get-inventory-reports.handler";
import { GetProcurementReportsHandler } from "../application/queries/get-procurement-reports.handler";
import { GetDeliveryCustomerReportsHandler } from "../application/queries/get-delivery-customer-reports.handler";
import { JwtAuthGuard } from "../../identity-access/api/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../identity-access/api/guards/permissions.guard";
import { RequirePermission } from "../../identity-access/api/guards/require-permission.decorator";
import { BranchScopeGuard, BranchScoped, CompanyWideOnly, branchScopeOf } from "../../../shared/authorization/branch-scope";
import type { AuthenticatedUser } from "../../identity-access/api/types";
import { PERMISSION } from "../../identity-access/domain/permission";
import { ListQueryDto, pageOfRows, pageRequestOf } from "../../../shared/http/list-query.dto";

@Controller("reports")
@UseGuards(JwtAuthGuard, PermissionsGuard, BranchScopeGuard)
@BranchScoped()
export class ReportsController {
  constructor(
    private readonly getDashboardSummary: GetDashboardSummaryHandler,
    private readonly getFoodCostReport: GetFoodCostReportHandler,
    private readonly getActionCenter: GetActionCenterHandler,
    private readonly getBranchHealth: GetBranchHealthHandler,
    private readonly getSalesOps: GetSalesOpsReportsHandler,
    private readonly getInventoryReports: GetInventoryReportsHandler,
    private readonly getProcurementReports: GetProcurementReportsHandler,
    private readonly getDeliveryCustomerReports: GetDeliveryCustomerReportsHandler
  ) {}

  @Get("dashboard")
  @RequirePermission(PERMISSION.REPORTS_VIEW)
  async dashboard(
    @Query("branchId") branchId: string | undefined,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @Req() req: Request & { user: AuthenticatedUser }
  ) {
    // نفس نطاق الريبو القديم بالظبط: مدير الفرع مقفول على فرعه، أدمن ومحاسب يقدروا يشوفوا أي فرع
    // (أو كل الفروع سوا لو معندهمش فلتر) - راجع docs بحث الـReports
    const effectiveBranchId = this.effectiveBranchId(req, branchId);
    return this.getDashboardSummary.execute({ branchId: effectiveBranchId, from, to });
  }

  // تكلفة الطعام: النظري (المستهلك حسب الوصفة) مقابل الفعلي (بعد تصحيحات الجرد/إلغاء الطلبات) لكل صنف
  @Get("food-cost")
  @RequirePermission(PERMISSION.REPORTS_VIEW)
  async foodCost(
    @Query("branchId") branchId: string | undefined,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @Req() req: Request & { user: AuthenticatedUser }
  ) {
    const effectiveBranchId = this.effectiveBranchId(req, branchId);
    return this.getFoodCostReport.execute({ branchId: effectiveBranchId, from, to });
  }

  // نفس تقرير تكلفة الطعام لكن مجمّع على مستوى كل فرع - أساس بطاقة صحة الفروع (Branch Health) لاحقًا
  @CompanyWideOnly()
  @Get("food-cost/by-branch")
  @RequirePermission(PERMISSION.REPORTS_VIEW)
  async foodCostByBranch(@Query("from") from: string | undefined, @Query("to") to: string | undefined) {
    return this.getFoodCostReport.executeByBranch({ from, to });
  }

  // مركز التنبيهات - نقطة واحدة تجمّع كل استثناء يستاهل انتباه فوري (مخزون سالب/دفعات من غير مطابقة/
  // فرق تصنيع/مصروف متجاوز الحد/فرق تكلفة طعام/فاتورة مورد متأخرة/شكوى عميل فاضلة) بدل ما يتفتح كل
  // تقرير لوحده كل يوم
  @Get("action-center")
  @RequirePermission(PERMISSION.REPORTS_VIEW)
  async actionCenter(
    @Query() listQuery: ListQueryDto,
    @Query("branchId") branchId: string | undefined,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @Req() req: Request & { user: AuthenticatedUser }
  ) {
    const effectiveBranchId = this.effectiveBranchId(req, branchId);
    const report = await this.getActionCenter.execute({ branchId: effectiveBranchId, from, to });
    const page = pageRequestOf(listQuery);
    if (!page) return report;
    return { ...report, alerts: pageOfRows(report.alerts, page), total: report.alerts.length, limit: page.limit, offset: page.offset };
  }

  // بطاقة صحة الفروع - مقارنة كل الفروع في مكان واحد (إيراد/تكلفة طعام%/فرق كاش/مخزون سالب/شكاوى)،
  // أدمن/محاسب بس (نفس نطاق الريبو القديم - المقارنة الشاملة بين الفروع مش حاجة مدير فرع واحد يحتاجها)
  @CompanyWideOnly()
  @Get("branch-health")
  @RequirePermission(PERMISSION.REPORTS_BRANCH_HEALTH)
  async branchHealth(@Query("from") from: string | undefined, @Query("to") to: string | undefined) {
    return this.getBranchHealth.execute({ from, to });
  }

  private effectiveBranchId(req: Request & { user: AuthenticatedUser }, branchId: string | undefined): string | null {
    // server-side scope: a branch-bound user is always pinned to its own branch (a foreign branchId is rejected by BranchScopeGuard)
    const scope = branchScopeOf(req.user);
    return scope.kind === "branch" ? scope.branchId : (branchId ?? null);
  }

  // ملخّص يومي لكل فرع - عدد الطلبات والإيراد لكل يوم في المدى
  @Get("daily")
  @RequirePermission(PERMISSION.REPORTS_VIEW)
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
  @RequirePermission(PERMISSION.REPORTS_VIEW)
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
  @RequirePermission(PERMISSION.REPORTS_VIEW)
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
  @RequirePermission(PERMISSION.REPORTS_VIEW)
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
  @RequirePermission(PERMISSION.REPORTS_VIEW)
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
  @RequirePermission(PERMISSION.REPORTS_VIEW)
  async catalog(
    @Query("branchId") branchId: string | undefined,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @Req() req: Request & { user: AuthenticatedUser }
  ) {
    return this.getSalesOps.catalog({ branchId: this.effectiveBranchId(req, branchId), from, to });
  }

  // كل الوصفات (مكوّناتها وتكلفتها) - لمراجعة جودة البيانات (وصفة ناقصة/مكوّن من غير تكلفة)
  @CompanyWideOnly()
  @Get("recipes")
  @RequirePermission(PERMISSION.REPORTS_VIEW)
  async recipes() {
    return this.getSalesOps.recipes();
  }

  // تقييم المخزون - قيمة كل صنف في كل فرع (كمية × تكلفة الوحدة)، وإجمالي لكل فرع وللكل
  @Get("inventory-valuation")
  @RequirePermission(PERMISSION.REPORTS_VIEW)
  async inventoryValuation(@Query("branchId") branchId: string | undefined, @Req() req: Request & { user: AuthenticatedUser }) {
    return this.getInventoryReports.valuation({ branchId: this.effectiveBranchId(req, branchId) });
  }

  // كارت الصنف - كل حركة اتسجلت على صنف في فرع بالترتيب الزمني، مع الرصيد بعد كل حركة
  @Get("stock-card")
  @RequirePermission(PERMISSION.REPORTS_VIEW)
  async stockCard(
    @Query("branchId") branchId: string | undefined,
    @Query("inventoryItemId") inventoryItemId: string,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @Req() req: Request & { user: AuthenticatedUser }
  ) {
    const effectiveBranchId = this.effectiveBranchId(req, branchId);
    if (!effectiveBranchId) throw new BadRequestException("لازم تحدد branchId");
    return this.getInventoryReports.stockCard({ branchId: effectiveBranchId, inventoryItemId, from, to });
  }

  // تقرير التحويلات بين الفروع في المدى - مع فرق المُرسل عن المُستلم (variance) لكل بند
  @Get("transfers")
  @RequirePermission(PERMISSION.REPORTS_VIEW)
  async transfers(
    @Query("branchId") branchId: string | undefined,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @Req() req: Request & { user: AuthenticatedUser }
  ) {
    return this.getInventoryReports.transfers({ branchId: this.effectiveBranchId(req, branchId), from, to });
  }

  // أي صنف رصيده سالب دلوقتي - القائمة التفصيلية (مش العدد بس زي مركز التنبيهات)
  @Get("negative-stock")
  @RequirePermission(PERMISSION.REPORTS_VIEW)
  async negativeStock(@Query("branchId") branchId: string | undefined, @Req() req: Request & { user: AuthenticatedUser }) {
    return this.getInventoryReports.negativeStock({ branchId: this.effectiveBranchId(req, branchId) });
  }

  // مقارنة رصيد صنف (أو كل الأصناف) بين كل الفروع جنب بعض - أدمن/محاسب بس، زي بطاقة صحة الفروع بالظبط
  @CompanyWideOnly()
  @Get("inventory-comparison")
  @RequirePermission(PERMISSION.REPORTS_BRANCH_HEALTH)
  async inventoryComparison(@Query("inventoryItemId") inventoryItemId: string | undefined) {
    return this.getInventoryReports.inventoryComparison({ inventoryItemId: inventoryItemId ?? null });
  }

  // BATCH-1: دفعات هتنتهي صلاحيتها خلال N يوم (افتراضي 7)
  @Get("expiring-batches")
  @RequirePermission(PERMISSION.REPORTS_VIEW)
  async expiringBatches(
    @Query("days") days: string | undefined,
    @Query("branchId") branchId: string | undefined,
    @Req() req: Request & { user: AuthenticatedUser }
  ) {
    return this.getInventoryReports.expiringBatches({
      days: days ? Number(days) : undefined,
      branchId: this.effectiveBranchId(req, branchId),
    });
  }

  // قائمة أوامر الشراء في المدى - مع عدد البنود وإجمالي القيمة، وفلترة بالفرع/المورد/الحالة
  @Get("purchase-orders")
  @RequirePermission(PERMISSION.PURCHASING_VIEW)
  async purchaseOrders(
    @Query("branchId") branchId: string | undefined,
    @Query("supplierId") supplierId: string | undefined,
    @Query("status") status: string | undefined,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @Req() req: Request & { user: AuthenticatedUser }
  ) {
    return this.getProcurementReports.purchaseOrders({ branchId: this.effectiveBranchId(req, branchId), supplierId, status, from, to });
  }

  // أذون الاستلام المؤكّدة (CONFIRMED) في المدى - مع إجمالي القيمة
  @Get("purchase-receipts")
  @RequirePermission(PERMISSION.PURCHASING_VIEW)
  async purchaseReceipts(
    @Query("branchId") branchId: string | undefined,
    @Query("supplierId") supplierId: string | undefined,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @Req() req: Request & { user: AuthenticatedUser }
  ) {
    return this.getProcurementReports.purchaseReceipts({ branchId: this.effectiveBranchId(req, branchId), supplierId, from, to });
  }

  // تاريخ سعر صنف عبر كل أوامر الشراء (عند مورد معيّن أو كل الموردين) - مستنتج من بنود الأوامر الفعلية
  // مش من كتالوج أسعار منفصل (راجع تعليق procurement-reports-reader.port.ts)
  @CompanyWideOnly()
  @Get("purchase-price-history")
  @RequirePermission(PERMISSION.PURCHASING_VIEW)
  async purchasePriceHistory(@Query("inventoryItemId") inventoryItemId: string, @Query("supplierId") supplierId: string | undefined) {
    return this.getProcurementReports.purchasePriceHistory({ inventoryItemId, supplierId });
  }

  // كل بنود أوامر الشراء في المدى مع فرق سعرها عن آخر سعر سابق لنفس (مورد، صنف)
  @Get("purchase-price-variance")
  @RequirePermission(PERMISSION.PURCHASING_VIEW)
  async purchasePriceVariance(
    @Query("branchId") branchId: string | undefined,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @Req() req: Request & { user: AuthenticatedUser }
  ) {
    return this.getProcurementReports.purchasePriceVariance({ branchId: this.effectiveBranchId(req, branchId), from, to });
  }

  // أداء مورد معيّن في المدى - معدّل التنفيذ، ومتوسط مدة التسليم (بالأيام) لحد تأكيد إذن الاستلام
  @CompanyWideOnly()
  @Get("supplier-performance")
  @RequirePermission(PERMISSION.PURCHASING_VIEW)
  async supplierPerformance(
    @Query("supplierId") supplierId: string,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined
  ) {
    return this.getProcurementReports.supplierPerformance({ supplierId, from, to });
  }

  // أوامر شراء اتبعتت للمورد ولسه من غير إذن استلام مؤكّد عليها (لسه مستنية)
  @Get("outstanding-purchase-orders")
  @RequirePermission(PERMISSION.PURCHASING_VIEW)
  async outstandingPurchaseOrders(@Query("branchId") branchId: string | undefined, @Req() req: Request & { user: AuthenticatedUser }) {
    return this.getProcurementReports.outstandingPurchaseOrders({ branchId: this.effectiveBranchId(req, branchId) });
  }

  // أداء كل سائق: عدد الطلبات المسلّمة، الإيراد، عدد الفشل، متوسط وقت التوصيل الفعلي
  @Get("drivers")
  @RequirePermission(PERMISSION.REPORTS_VIEW)
  async drivers(
    @Query("branchId") branchId: string | undefined,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @Req() req: Request & { user: AuthenticatedUser }
  ) {
    return this.getDeliveryCustomerReports.drivers({ branchId: this.effectiveBranchId(req, branchId), from, to });
  }

  // مؤشرات خدمة الدليفري الإجمالية: متوسط وقت التحضير والتوصيل، نسبة الالتزام بالوقت، نسبة الفشل
  @Get("delivery-service")
  @RequirePermission(PERMISSION.REPORTS_VIEW)
  async deliveryService(
    @Query("branchId") branchId: string | undefined,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @Query("thresholdMinutes") thresholdMinutes: string | undefined,
    @Req() req: Request & { user: AuthenticatedUser }
  ) {
    return this.getDeliveryCustomerReports.deliveryService({
      branchId: this.effectiveBranchId(req, branchId), from, to,
      thresholdMinutes: thresholdMinutes ? Number(thresholdMinutes) : undefined,
    });
  }

  // ساعات الذروة - عدد الطلبات والإيراد حسب الساعة ويوم الأسبوع
  @Get("peak-hours")
  @RequirePermission(PERMISSION.REPORTS_VIEW)
  async peakHours(
    @Query("branchId") branchId: string | undefined,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @Req() req: Request & { user: AuthenticatedUser }
  ) {
    return this.getDeliveryCustomerReports.peakHours({ branchId: this.effectiveBranchId(req, branchId), from, to });
  }

  // أعلى العملاء إنفاقًا وتكرار طلب في المدى + عدد العملاء الجدد
  @Get("customer-spend")
  @RequirePermission(PERMISSION.REPORTS_VIEW)
  async customerSpend(
    @Query("branchId") branchId: string | undefined,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @Query("limit") limit: string | undefined,
    @Req() req: Request & { user: AuthenticatedUser }
  ) {
    return this.getDeliveryCustomerReports.customerSpend({
      branchId: this.effectiveBranchId(req, branchId), from, to, limit: limit ? Number(limit) : undefined,
    });
  }

  // المصروفات مجمّعة حسب الفئة + الاتجاه الزمني + تنبيهات تجاوز الحد لكل فئة
  @Get("expenses-report")
  @RequirePermission(PERMISSION.REPORTS_VIEW)
  async expensesReport(
    @Query("branchId") branchId: string | undefined,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @Query("groupBy") groupBy: string | undefined,
    @Req() req: Request & { user: AuthenticatedUser }
  ) {
    return this.getDeliveryCustomerReports.expensesReport({
      branchId: this.effectiveBranchId(req, branchId), from, to, groupBy: groupBy === "month" ? "month" : "day",
    });
  }

  // المشتريات النقدية مجمّعة حسب الفئة + الاتجاه الزمني
  @Get("purchases-report")
  @RequirePermission(PERMISSION.REPORTS_VIEW)
  async purchasesReport(
    @Query("branchId") branchId: string | undefined,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @Query("groupBy") groupBy: string | undefined,
    @Req() req: Request & { user: AuthenticatedUser }
  ) {
    return this.getDeliveryCustomerReports.purchasesReport({
      branchId: this.effectiveBranchId(req, branchId), from, to, groupBy: groupBy === "month" ? "month" : "day",
    });
  }
}
