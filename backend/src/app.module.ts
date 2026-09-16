import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { DatabaseModule } from "./shared/database/database.module";
import { EventsModule } from "./shared/events/events.module";
import { PermissionsModule } from "./shared/permissions/permissions.module";
import { IdentityAccessModule } from "./contexts/identity-access/identity-access.module";
import { CrmModule } from "./contexts/crm/crm.module";
import { BranchesModule } from "./contexts/branches/branches.module";
import { InventoryModule } from "./contexts/inventory/inventory.module";
import { CatalogModule } from "./contexts/catalog/catalog.module";
import { ProcurementModule } from "./contexts/procurement/procurement.module";
import { OrdersModule } from "./contexts/orders/orders.module";
import { DeliveryModule } from "./contexts/delivery/delivery.module";
import { AccountingModule } from "./contexts/accounting/accounting.module";
import { PaymentControlModule } from "./contexts/payment-control/payment-control.module";
import { HrPayrollModule } from "./contexts/hr-payroll/hr-payroll.module";

@Module({
  imports: [
    DatabaseModule,
    EventsModule,
    PermissionsModule,
    IdentityAccessModule,
    BranchesModule,
    CrmModule,
    InventoryModule,
    CatalogModule,
    ProcurementModule,
    OrdersModule,
    DeliveryModule,
    AccountingModule,
    PaymentControlModule,
    HrPayrollModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
