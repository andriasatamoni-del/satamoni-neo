import { Module, OnModuleInit } from "@nestjs/common";
import { PermissionRegistry } from "../../shared/permissions/permission-registry";
import { EventBusService } from "../../shared/events/event-bus.service";
import { IdentityAccessModule } from "../identity-access/identity-access.module";
import { PAYMENT_METHOD_REPOSITORY } from "./domain/ports/payment-method-repository.port";
import { PAYMENT_REPOSITORY } from "./domain/ports/payment-repository.port";
import { PAYMENT_ADJUSTMENT_REQUEST_REPOSITORY } from "./domain/ports/payment-adjustment-request-repository.port";
import { RECONCILIATION_RECORD_REPOSITORY } from "./domain/ports/reconciliation-record-repository.port";
import { KyselyPaymentMethodRepository } from "./infrastructure/persistence/kysely-payment-method.repository";
import { KyselyPaymentRepository } from "./infrastructure/persistence/kysely-payment.repository";
import { KyselyPaymentAdjustmentRequestRepository } from "./infrastructure/persistence/kysely-payment-adjustment-request.repository";
import { KyselyReconciliationRecordRepository } from "./infrastructure/persistence/kysely-reconciliation-record.repository";
import { RegisterPaymentMethodHandler } from "./application/commands/register-payment-method.handler";
import { LockPaymentForOrderHandler } from "./application/commands/lock-payment-for-order.handler";
import { RequestPaymentAdjustmentHandler } from "./application/commands/request-payment-adjustment.handler";
import { ApprovePaymentAdjustmentHandler } from "./application/commands/approve-payment-adjustment.handler";
import { RejectPaymentAdjustmentHandler } from "./application/commands/reject-payment-adjustment.handler";
import { RegisterReconciliationRecordHandler } from "./application/commands/register-reconciliation-record.handler";
import { MatchReconciliationRecordHandler } from "./application/commands/match-reconciliation-record.handler";
import { IgnoreReconciliationRecordHandler } from "./application/commands/ignore-reconciliation-record.handler";
import { AutoMatchReconciliationRecordsHandler } from "./application/commands/auto-match-reconciliation-records.handler";
import { ListPaymentMethodsHandler } from "./application/queries/list-payment-methods.handler";
import { ListPaymentsHandler } from "./application/queries/list-payments.handler";
import { ListAdjustmentRequestsHandler } from "./application/queries/list-adjustment-requests.handler";
import { ListReconciliationRecordsHandler } from "./application/queries/list-reconciliation-records.handler";
import { ListExceptionsHandler } from "./application/queries/list-exceptions.handler";
import { PaymentControlController } from "./api/payment-control.controller";
import type { OrderRegisteredEvent } from "../orders/domain/events/order-registered.event";

@Module({
  imports: [IdentityAccessModule],
  controllers: [PaymentControlController],
  providers: [
    { provide: PAYMENT_METHOD_REPOSITORY, useClass: KyselyPaymentMethodRepository },
    { provide: PAYMENT_REPOSITORY, useClass: KyselyPaymentRepository },
    { provide: PAYMENT_ADJUSTMENT_REQUEST_REPOSITORY, useClass: KyselyPaymentAdjustmentRequestRepository },
    { provide: RECONCILIATION_RECORD_REPOSITORY, useClass: KyselyReconciliationRecordRepository },
    RegisterPaymentMethodHandler,
    LockPaymentForOrderHandler,
    RequestPaymentAdjustmentHandler,
    ApprovePaymentAdjustmentHandler,
    RejectPaymentAdjustmentHandler,
    RegisterReconciliationRecordHandler,
    MatchReconciliationRecordHandler,
    IgnoreReconciliationRecordHandler,
    AutoMatchReconciliationRecordsHandler,
    ListPaymentMethodsHandler,
    ListPaymentsHandler,
    ListAdjustmentRequestsHandler,
    ListReconciliationRecordsHandler,
    ListExceptionsHandler,
  ],
  exports: [PAYMENT_METHOD_REPOSITORY, PAYMENT_REPOSITORY],
})
export class PaymentControlModule implements OnModuleInit {
  constructor(
    private readonly permissions: PermissionRegistry,
    private readonly eventBus: EventBusService,
    private readonly lockPaymentForOrder: LockPaymentForOrderHandler
  ) {}

  onModuleInit(): void {
    this.permissions.registerGroup({
      group: "payment_control",
      groupLabel: "التحكم في المدفوعات والمطابقة",
      permissions: [
        { key: "payment_control.view", label: "رؤية الدفعات والمطابقة" },
        { key: "payment_control.methods.manage", label: "إدارة طرق الدفع" },
        { key: "payment_control.adjustment.request", label: "طلب تعديل دفعة" },
        { key: "payment_control.adjustment.approve", label: "اعتماد تعديل دفعة (سقف عادي)" },
        { key: "payment_control.adjustment.approve_high", label: "اعتماد تعديل دفعة (سقف عالي)" },
        { key: "payment_control.reconciliation.enter", label: "إدخال ومطابقة كشوف الحساب" },
        { key: "payment_control.exceptions.resolve", label: "مراجعة الاستثناءات ونقاط المخاطر" },
      ],
    });
    this.permissions.setRoleDefaults("cashier", ["payment_control.adjustment.request"]);
    this.permissions.setRoleDefaults("branch_manager", [
      "payment_control.view",
      "payment_control.adjustment.request",
      "payment_control.adjustment.approve",
    ]);
    this.permissions.setRoleDefaults("accountant", [
      "payment_control.view",
      "payment_control.methods.manage",
      "payment_control.adjustment.request",
      "payment_control.adjustment.approve",
      "payment_control.adjustment.approve_high",
      "payment_control.reconciliation.enter",
      "payment_control.exceptions.resolve",
    ]);

    // تاني مستهلك لـOrderRegisteredEvent (بعد Accounting) - قفل الدفعة فوره وقت تسجيل الطلب لو
    // paymentMethodId متحدد
    this.eventBus.subscribe<OrderRegisteredEvent>("OrderRegistered", (event) => this.lockPaymentForOrder.handle(event));
  }
}
