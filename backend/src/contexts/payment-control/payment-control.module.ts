import { Module, OnModuleInit } from "@nestjs/common";
import { EventBusService } from "../../shared/events/event-bus.service";
import { IdentityAccessModule } from "../identity-access/identity-access.module";
import { SettingsModule } from "../settings/settings.module";
import { PAYMENT_METHOD_REPOSITORY } from "./domain/ports/payment-method-repository.port";
import { PAYMENT_REPOSITORY } from "./domain/ports/payment-repository.port";
import { PAYMENT_ADJUSTMENT_REQUEST_REPOSITORY } from "./domain/ports/payment-adjustment-request-repository.port";
import { RECONCILIATION_RECORD_REPOSITORY } from "./domain/ports/reconciliation-record-repository.port";
import { PaymentMethodRepository } from "./infrastructure/persistence/payment-method.repository";
import { PaymentRepository } from "./infrastructure/persistence/payment.repository";
import { PaymentAdjustmentRequestRepository } from "./infrastructure/persistence/payment-adjustment-request.repository";
import { ReconciliationRecordRepository } from "./infrastructure/persistence/reconciliation-record.repository";
import { RegisterPaymentMethodHandler } from "./application/commands/register-payment-method.handler";
import { LinkTalabatPaymentCodeHandler } from "./application/commands/link-talabat-payment-code.handler";
import { LockPaymentForOrderHandler } from "./application/commands/lock-payment-for-order.handler";
import { RequestPaymentAdjustmentHandler } from "./application/commands/request-payment-adjustment.handler";
import { ApprovePaymentAdjustmentHandler } from "./application/commands/approve-payment-adjustment.handler";
import { RejectPaymentAdjustmentHandler } from "./application/commands/reject-payment-adjustment.handler";
import { RegisterReconciliationRecordHandler } from "./application/commands/register-reconciliation-record.handler";
import { MatchReconciliationRecordHandler } from "./application/commands/match-reconciliation-record.handler";
import { IgnoreReconciliationRecordHandler } from "./application/commands/ignore-reconciliation-record.handler";
import { AutoMatchReconciliationRecordsHandler } from "./application/commands/auto-match-reconciliation-records.handler";
import { CommitReconciliationImportHandler } from "./application/commands/commit-reconciliation-import.handler";
import { CancelReconciliationImportBatchHandler } from "./application/commands/cancel-reconciliation-import-batch.handler";
import { ListPaymentMethodsHandler } from "./application/queries/list-payment-methods.handler";
import { ListPaymentsHandler } from "./application/queries/list-payments.handler";
import { ListAdjustmentRequestsHandler } from "./application/queries/list-adjustment-requests.handler";
import { ListReconciliationRecordsHandler } from "./application/queries/list-reconciliation-records.handler";
import { ListExceptionsHandler } from "./application/queries/list-exceptions.handler";
import { GetDailyOwnerReportHandler } from "./application/queries/get-daily-owner-report.handler";
import { PaymentControlController } from "./api/payment-control.controller";
import type { OrderRegisteredEvent } from "../orders/domain/events/order-registered.event";

@Module({
  imports: [IdentityAccessModule, SettingsModule],
  controllers: [PaymentControlController],
  providers: [
    { provide: PAYMENT_METHOD_REPOSITORY, useClass: PaymentMethodRepository },
    { provide: PAYMENT_REPOSITORY, useClass: PaymentRepository },
    { provide: PAYMENT_ADJUSTMENT_REQUEST_REPOSITORY, useClass: PaymentAdjustmentRequestRepository },
    { provide: RECONCILIATION_RECORD_REPOSITORY, useClass: ReconciliationRecordRepository },
    RegisterPaymentMethodHandler,
    LinkTalabatPaymentCodeHandler,
    LockPaymentForOrderHandler,
    RequestPaymentAdjustmentHandler,
    ApprovePaymentAdjustmentHandler,
    RejectPaymentAdjustmentHandler,
    RegisterReconciliationRecordHandler,
    MatchReconciliationRecordHandler,
    IgnoreReconciliationRecordHandler,
    AutoMatchReconciliationRecordsHandler,
    CommitReconciliationImportHandler,
    CancelReconciliationImportBatchHandler,
    ListPaymentMethodsHandler,
    ListPaymentsHandler,
    ListAdjustmentRequestsHandler,
    ListReconciliationRecordsHandler,
    ListExceptionsHandler,
    GetDailyOwnerReportHandler,
  ],
  exports: [PAYMENT_METHOD_REPOSITORY, PAYMENT_REPOSITORY, PAYMENT_ADJUSTMENT_REQUEST_REPOSITORY, ListExceptionsHandler],
})
export class PaymentControlModule implements OnModuleInit {
  constructor(
    private readonly eventBus: EventBusService,
    private readonly lockPaymentForOrder: LockPaymentForOrderHandler
  ) {}

  onModuleInit(): void {
    // تاني مستهلك لـOrderRegisteredEvent (بعد Accounting) - قفل الدفعة فوره وقت تسجيل الطلب لو
    // paymentMethodId متحدد
    // critical: the payment is part of the order transaction (BL-09) - a failure rolls the whole order back
    this.eventBus.subscribe<OrderRegisteredEvent>("OrderRegistered", (event) => this.lockPaymentForOrder.handle(event), { critical: true });
  }
}
