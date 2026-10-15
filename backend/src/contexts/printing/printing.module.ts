import { Module, OnModuleInit } from "@nestjs/common";
import { EventBusService } from "../../shared/events/event-bus.service";
import { IdentityAccessModule } from "../identity-access/identity-access.module";
import { BranchesModule } from "../branches/branches.module";
import { CatalogModule } from "../catalog/catalog.module";
import { OrdersModule } from "../orders/orders.module";
import { PaymentControlModule } from "../payment-control/payment-control.module";
import { PRINTER_REPOSITORY } from "./domain/ports/printer-repository.port";
import { KITCHEN_STATION_REPOSITORY } from "./domain/ports/kitchen-station-repository.port";
import { PRINT_JOB_REPOSITORY } from "./domain/ports/print-job-repository.port";
import { PrinterRepository } from "./infrastructure/persistence/printer.repository";
import { KitchenStationRepository } from "./infrastructure/persistence/kitchen-station.repository";
import { PrintJobRepository } from "./infrastructure/persistence/print-job.repository";
import { OrderPrintDataBuilder } from "./application/services/order-print-data.builder";
import { PrintJobQueuer } from "./application/services/print-job-queuer.service";
import { KitchenTicketDispatcher } from "./application/services/kitchen-ticket-dispatcher.service";
import { RegisterPrinterHandler } from "./application/commands/register-printer.handler";
import { UpdatePrinterHandler } from "./application/commands/update-printer.handler";
import { DeletePrinterHandler } from "./application/commands/delete-printer.handler";
import { QueueTestPrintHandler } from "./application/commands/queue-test-print.handler";
import { RegisterKitchenStationHandler } from "./application/commands/register-kitchen-station.handler";
import { UpdateKitchenStationHandler } from "./application/commands/update-kitchen-station.handler";
import { DeleteKitchenStationHandler } from "./application/commands/delete-kitchen-station.handler";
import { RouteMenuCategoryHandler } from "./application/commands/route-menu-category.handler";
import { RouteMenuItemHandler } from "./application/commands/route-menu-item.handler";
import { ClaimPrintJobHandler } from "./application/commands/claim-print-job.handler";
import { MarkPrintJobPrintedHandler } from "./application/commands/mark-print-job-printed.handler";
import { MarkPrintJobFailedHandler } from "./application/commands/mark-print-job-failed.handler";
import { RetryPrintJobHandler } from "./application/commands/retry-print-job.handler";
import { QueueOrderCreationPrintJobsHandler } from "./application/commands/queue-order-creation-print-jobs.handler";
import { QueueDineinPreparingPrintJobsHandler } from "./application/commands/queue-dinein-preparing-print-jobs.handler";
import { QueueDeliveryHandoverPrintJobHandler } from "./application/commands/queue-delivery-handover-print-job.handler";
import { QueueDineinBillPrintJobHandler } from "./application/commands/queue-dinein-bill-print-job.handler";
import { ListPrintersHandler } from "./application/queries/list-printers.handler";
import { ListKitchenStationsHandler } from "./application/queries/list-kitchen-stations.handler";
import { ListPrintJobsHandler } from "./application/queries/list-print-jobs.handler";
import { GetMenuRoutingHandler } from "./application/queries/get-menu-routing.handler";
import { PrintersController } from "./api/printers.controller";
import { KitchenStationsController } from "./api/kitchen-stations.controller";
import { PrintJobsController } from "./api/print-jobs.controller";
import type { OrderRegisteredEvent } from "../orders/domain/events/order-registered.event";
import type { KitchenStatusAdvancedEvent } from "../orders/domain/events/kitchen-status-advanced.event";

@Module({
  imports: [IdentityAccessModule, BranchesModule, CatalogModule, OrdersModule, PaymentControlModule],
  controllers: [PrintersController, KitchenStationsController, PrintJobsController],
  providers: [
    { provide: PRINTER_REPOSITORY, useClass: PrinterRepository },
    { provide: KITCHEN_STATION_REPOSITORY, useClass: KitchenStationRepository },
    { provide: PRINT_JOB_REPOSITORY, useClass: PrintJobRepository },
    OrderPrintDataBuilder,
    PrintJobQueuer,
    KitchenTicketDispatcher,
    RegisterPrinterHandler,
    UpdatePrinterHandler,
    DeletePrinterHandler,
    QueueTestPrintHandler,
    RegisterKitchenStationHandler,
    UpdateKitchenStationHandler,
    DeleteKitchenStationHandler,
    RouteMenuCategoryHandler,
    RouteMenuItemHandler,
    ClaimPrintJobHandler,
    MarkPrintJobPrintedHandler,
    MarkPrintJobFailedHandler,
    RetryPrintJobHandler,
    QueueOrderCreationPrintJobsHandler,
    QueueDineinPreparingPrintJobsHandler,
    QueueDeliveryHandoverPrintJobHandler,
    QueueDineinBillPrintJobHandler,
    ListPrintersHandler,
    ListKitchenStationsHandler,
    ListPrintJobsHandler,
    GetMenuRoutingHandler,
  ],
})
export class PrintingModule implements OnModuleInit {
  constructor(
    private readonly eventBus: EventBusService,
    private readonly queueOrderCreationPrintJobs: QueueOrderCreationPrintJobsHandler,
    private readonly queueDineinPreparingPrintJobs: QueueDineinPreparingPrintJobsHandler
  ) {}

  onModuleInit(): void {
    // أول مستهلكين حقيقيين لـPrinting على حدثين مختلفين (Orders): طباعة أوتوماتيكية عند تسجيل الطلب
    // (تيك أواي/دليفري)، وطباعة تذاكر مطبخ الصالة لحظة ما التحضير يوصل PREPARING - من غير ما Orders
    // يعرف حاجة عن وجود Printing أصلًا (نفس فايدة الفصل اللي event bus اتصمم لأجلها)
    this.eventBus.subscribe<OrderRegisteredEvent>("OrderRegistered", (event) => this.queueOrderCreationPrintJobs.handle(event));
    this.eventBus.subscribe<KitchenStatusAdvancedEvent>("KitchenStatusAdvanced", (event) => this.queueDineinPreparingPrintJobs.handle(event));
  }
}
