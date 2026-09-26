import { Module, OnModuleInit } from "@nestjs/common";
import { PermissionRegistry } from "../../shared/permissions/permission-registry";
import { IdentityAccessModule } from "../identity-access/identity-access.module";
import { BranchesModule } from "../branches/branches.module";
import { OrdersModule } from "../orders/orders.module";
import { PaymentControlModule } from "../payment-control/payment-control.module";
import { TALABAT_ORDER_REPOSITORY } from "./domain/ports/talabat-order-repository.port";
import { TALABAT_PRODUCT_MAPPING_REPOSITORY } from "./domain/ports/talabat-product-mapping-repository.port";
import { TALABAT_INTEGRATION_ERROR_REPOSITORY } from "./domain/ports/talabat-integration-error-repository.port";
import { TALABAT_WEBHOOK_EVENT_REPOSITORY } from "./domain/ports/talabat-webhook-event-repository.port";
import { KyselyTalabatOrderRepository } from "./infrastructure/persistence/kysely-talabat-order.repository";
import { KyselyTalabatProductMappingRepository } from "./infrastructure/persistence/kysely-talabat-product-mapping.repository";
import { KyselyTalabatIntegrationErrorRepository } from "./infrastructure/persistence/kysely-talabat-integration-error.repository";
import { KyselyTalabatWebhookEventRepository } from "./infrastructure/persistence/kysely-talabat-webhook-event.repository";
import { TalabatWebhookAuthService } from "./infrastructure/security/talabat-webhook-auth.service";
import { TalabatClientStub } from "./infrastructure/talabat-client.stub";
import { ReceiveTalabatWebhookHandler } from "./application/commands/receive-talabat-webhook.handler";
import { SyncTalabatOrderHandler } from "./application/commands/sync-talabat-order.handler";
import { CancelTalabatOrderHandler } from "./application/commands/cancel-talabat-order.handler";
import { RetryIntegrationErrorHandler } from "./application/commands/retry-integration-error.handler";
import { UpsertProductMappingHandler } from "./application/commands/upsert-product-mapping.handler";
import { ListIntegrationErrorsHandler } from "./application/queries/list-integration-errors.handler";
import { ListProductMappingsHandler } from "./application/queries/list-product-mappings.handler";
import { ListTalabatOrdersHandler } from "./application/queries/list-talabat-orders.handler";
import { GetTalabatDashboardSummaryHandler } from "./application/queries/get-talabat-dashboard-summary.handler";
import { GetTalabatPaymentOverridesHandler } from "./application/queries/get-talabat-payment-overrides.handler";
import { TalabatWebhookController } from "./api/talabat-webhook.controller";
import { TalabatController } from "./api/talabat.controller";

// تكامل Talabat - نفس فلسفة الريبو القديم بالحرف (راجع docs/TALABAT-INTEGRATION.md): البنية الداخلية
// كاملة (webhook + idempotency + مزامنة + إلغاء + مطابقة + لوحة تحكم)، الاتصال الفعلي بـTalabat نفسه
// (talabat-client.stub.ts) موقوف عمدًا لحد ما مواصفة Partner API الحقيقية تتوفر. محرك المزامنة بيستخدم
// RegisterOrderHandler/CancelOrderHandler بتوع Orders مباشرة (direct injection، مش event bus) - لازم
// ينجح متزامنًا مع عملية المزامنة نفسها (نفس نمط Expenses->Accounting/Purchases->Inventory بالظبط)
@Module({
  imports: [IdentityAccessModule, BranchesModule, OrdersModule, PaymentControlModule],
  controllers: [TalabatWebhookController, TalabatController],
  providers: [
    { provide: TALABAT_ORDER_REPOSITORY, useClass: KyselyTalabatOrderRepository },
    { provide: TALABAT_PRODUCT_MAPPING_REPOSITORY, useClass: KyselyTalabatProductMappingRepository },
    { provide: TALABAT_INTEGRATION_ERROR_REPOSITORY, useClass: KyselyTalabatIntegrationErrorRepository },
    { provide: TALABAT_WEBHOOK_EVENT_REPOSITORY, useClass: KyselyTalabatWebhookEventRepository },
    TalabatWebhookAuthService,
    TalabatClientStub,
    ReceiveTalabatWebhookHandler,
    SyncTalabatOrderHandler,
    CancelTalabatOrderHandler,
    RetryIntegrationErrorHandler,
    UpsertProductMappingHandler,
    ListIntegrationErrorsHandler,
    ListProductMappingsHandler,
    ListTalabatOrdersHandler,
    GetTalabatDashboardSummaryHandler,
    GetTalabatPaymentOverridesHandler,
  ],
})
export class TalabatModule implements OnModuleInit {
  constructor(private readonly permissions: PermissionRegistry) {}

  onModuleInit(): void {
    this.permissions.registerGroup({
      group: "talabat",
      groupLabel: "تكامل Talabat",
      permissions: [
        { key: "talabat.view", label: "رؤية لوحة تكامل Talabat" },
        { key: "talabat.retry", label: "إعادة محاولة أخطاء المزامنة" },
        { key: "talabat.payment_override", label: "تعديل دفعة أوردر مصدره Talabat" },
        { key: "talabat.reconciliation", label: "مطابقة ديل Talabat" },
        { key: "talabat.mapping_manage", label: "إدارة ربط الفروع/طرق الدفع/الأصناف" },
      ],
    });
    this.permissions.setRoleDefaults("cashier", ["talabat.view"]);
    this.permissions.setRoleDefaults("callcenter", ["talabat.view"]);
    this.permissions.setRoleDefaults("branch_manager", ["talabat.view", "talabat.retry"]);
    this.permissions.setRoleDefaults("accountant", ["talabat.view", "talabat.retry", "talabat.payment_override", "talabat.reconciliation"]);
    // talabat.mapping_manage أدمن بس - نفس docs/TALABAT-INTEGRATION.md قسم 7 بالحرف
  }
}
