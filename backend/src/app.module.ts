import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { DatabaseModule } from "./shared/database/database.module";
import { EventsModule } from "./shared/events/events.module";
import { PermissionsModule } from "./shared/permissions/permissions.module";
import { AuditModule } from "./shared/audit/audit.module";
import { IdentityAccessModule } from "./contexts/identity-access/identity-access.module";
import { CrmModule } from "./contexts/crm/crm.module";
import { BranchesModule } from "./contexts/branches/branches.module";
import { InventoryModule } from "./contexts/inventory/inventory.module";
import { CatalogModule } from "./contexts/catalog/catalog.module";
import { ProductionModule } from "./contexts/production/production.module";
import { WhatsappModule } from "./contexts/whatsapp/whatsapp.module";
import { ProcurementModule } from "./contexts/procurement/procurement.module";
import { OrdersModule } from "./contexts/orders/orders.module";
import { DeliveryModule } from "./contexts/delivery/delivery.module";
import { AccountingModule } from "./contexts/accounting/accounting.module";
import { PaymentControlModule } from "./contexts/payment-control/payment-control.module";
import { HrPayrollModule } from "./contexts/hr-payroll/hr-payroll.module";
import { ShiftsModule } from "./contexts/shifts/shifts.module";
import { ReportingModule } from "./contexts/reporting/reporting.module";
import { TreasuryModule } from "./contexts/treasury/treasury.module";
import { PrintingModule } from "./contexts/printing/printing.module";
import { SettingsModule } from "./contexts/settings/settings.module";

@Module({
  imports: [
    DatabaseModule,
    EventsModule,
    PermissionsModule,
    AuditModule,
    IdentityAccessModule,
    SettingsModule,
    BranchesModule,
    CrmModule,
    InventoryModule,
    CatalogModule,
    ProductionModule,
    ProcurementModule,
    OrdersModule,
    WhatsappModule,
    DeliveryModule,
    AccountingModule,
    PaymentControlModule,
    HrPayrollModule,
    ShiftsModule,
    ReportingModule,
    TreasuryModule,
    PrintingModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
