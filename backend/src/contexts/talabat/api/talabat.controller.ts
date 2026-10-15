import { Body, Controller, Get, Param, Post, Query, UseFilters, UseGuards } from "@nestjs/common";
import { RetryIntegrationErrorHandler } from "../application/commands/retry-integration-error.handler";
import { UpsertProductMappingHandler } from "../application/commands/upsert-product-mapping.handler";
import { ListIntegrationErrorsHandler } from "../application/queries/list-integration-errors.handler";
import { ListProductMappingsHandler } from "../application/queries/list-product-mappings.handler";
import { ListTalabatOrdersHandler } from "../application/queries/list-talabat-orders.handler";
import { GetTalabatDashboardSummaryHandler } from "../application/queries/get-talabat-dashboard-summary.handler";
import { GetTalabatPaymentOverridesHandler } from "../application/queries/get-talabat-payment-overrides.handler";
import { UpsertProductMappingDto } from "./dto/upsert-product-mapping.dto";
import { JwtAuthGuard } from "../../identity-access/api/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../identity-access/api/guards/permissions.guard";
import { RequirePermission } from "../../identity-access/api/guards/require-permission.decorator";
import { BranchScopeGuard, BranchScoped, CompanyWideOnly } from "../../../shared/authorization/branch-scope";
import { TalabatDomainErrorFilter } from "./filters/domain-error.filter";
import type { TalabatOrder } from "../domain/talabat-order.aggregate";
import type { TalabatIntegrationError } from "../domain/talabat-integration-error.aggregate";
import type { TalabatProductMapping } from "../domain/talabat-product-mapping.aggregate";
import { PERMISSION } from "../../identity-access/domain/permission";

// شاشات الإدارة - integration-errors (list/retry)، لوحة التحكم، إدارة الربط، تقرير Payment Control -
// نفس مفهوم routes/talabat.js بالريبو القديم بالظبط (راجع docs/TALABAT-INTEGRATION.md قسم 10)
@Controller("talabat")
@UseGuards(JwtAuthGuard, PermissionsGuard, BranchScopeGuard)
@UseFilters(TalabatDomainErrorFilter)
export class TalabatController {
  constructor(
    private readonly retryIntegrationError: RetryIntegrationErrorHandler,
    private readonly upsertProductMapping: UpsertProductMappingHandler,
    private readonly listIntegrationErrors: ListIntegrationErrorsHandler,
    private readonly listProductMappings: ListProductMappingsHandler,
    private readonly listTalabatOrders: ListTalabatOrdersHandler,
    private readonly getDashboardSummary: GetTalabatDashboardSummaryHandler,
    private readonly getPaymentOverrides: GetTalabatPaymentOverridesHandler
  ) {}

  @BranchScoped()
  @Get("dashboard-summary")
  @RequirePermission(PERMISSION.TALABAT_VIEW)
  async dashboardSummary(@Query("branchId") branchId?: string, @Query("date") date?: string) {
    return this.getDashboardSummary.execute({ branchId, date: date ? new Date(date) : undefined });
  }

  @BranchScoped()
  @Get("orders")
  @RequirePermission(PERMISSION.TALABAT_VIEW)
  async orders(@Query("branchId") branchId?: string, @Query("status") status?: string) {
    return (await this.listTalabatOrders.execute({ branchId, status })).map(toPublicTalabatOrder);
  }

  @CompanyWideOnly()
  @Get("integration-errors")
  @RequirePermission(PERMISSION.TALABAT_VIEW)
  async integrationErrors(@Query("status") status?: string) {
    return (await this.listIntegrationErrors.execute({ status })).map(toPublicIntegrationError);
  }

  @CompanyWideOnly()
  @Post("integration-errors/:id/retry")
  @RequirePermission(PERMISSION.TALABAT_RETRY)
  async retryError(@Param("id") id: string) {
    return toPublicIntegrationError(await this.retryIntegrationError.execute({ integrationErrorId: id }));
  }

  @BranchScoped()
  @Get("product-mapping")
  @RequirePermission(PERMISSION.TALABAT_MAPPING_MANAGE)
  async productMapping(@Query("branchId") branchId: string) {
    return (await this.listProductMappings.execute(branchId)).map(toPublicProductMapping);
  }

  @BranchScoped()
  @Post("product-mapping")
  @RequirePermission(PERMISSION.TALABAT_MAPPING_MANAGE)
  async createProductMapping(@Body() dto: UpsertProductMappingDto) {
    return toPublicProductMapping(await this.upsertProductMapping.execute(dto));
  }

  @CompanyWideOnly()
  @Get("reconciliation")
  @RequirePermission(PERMISSION.TALABAT_RECONCILIATION)
  async reconciliation() {
    // نفس فلسفة docs/TALABAT-INTEGRATION.md قسم 10 بالحرف - جلب سجلات Talabat الحقيقية لسه stub
    // (talabat-client.stub.ts) لحد ما مواصفة Partner API الحقيقية تتوفر
    return { status: "TALABAT_API_NOT_CONFIGURED" as const, records: [] };
  }

  @CompanyWideOnly()
  @Get("payment-control-report")
  @RequirePermission(PERMISSION.TALABAT_RECONCILIATION)
  async paymentControlReport() {
    return this.getPaymentOverrides.execute();
  }
}

function toPublicTalabatOrder(order: TalabatOrder) {
  return {
    id: order.id,
    talabatOrderId: order.talabatOrderId,
    branchId: order.branchId,
    posOrderId: order.posOrderId,
    status: order.status,
    errorReason: order.errorReason,
    canceledAt: order.canceledAt,
    cancellationSource: order.cancellationSource,
    createdAt: order.createdAt,
  };
}

function toPublicIntegrationError(error: TalabatIntegrationError) {
  return {
    id: error.id,
    stage: error.stage,
    talabatOrderId: error.talabatOrderId,
    message: error.message,
    retryCount: error.retryCount,
    lastRetryAt: error.lastRetryAt,
    status: error.status,
    createdAt: error.createdAt,
  };
}

function toPublicProductMapping(mapping: TalabatProductMapping) {
  return {
    id: mapping.id,
    branchId: mapping.branchId,
    talabatItemId: mapping.talabatItemId,
    menuItemId: mapping.menuItemId,
    variantId: mapping.variantId,
  };
}
