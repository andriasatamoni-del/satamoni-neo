import { Module } from "@nestjs/common";
import { IdentityAccessModule } from "../identity-access/identity-access.module";
import { PaymentControlModule } from "../payment-control/payment-control.module";
import { SettingsModule } from "../settings/settings.module";
import { DASHBOARD_SUMMARY_READER } from "./domain/ports/dashboard-summary-reader.port";
import { DashboardSummaryReader } from "./infrastructure/persistence/dashboard-summary-reader";
import { GetDashboardSummaryHandler } from "./application/queries/get-dashboard-summary.handler";
import { FOOD_COST_READER } from "./domain/ports/food-cost-reader.port";
import { FoodCostReader } from "./infrastructure/persistence/food-cost-reader";
import { GetFoodCostReportHandler } from "./application/queries/get-food-cost-report.handler";
import { ACTION_CENTER_READER } from "./domain/ports/action-center-reader.port";
import { ActionCenterReader } from "./infrastructure/persistence/action-center-reader";
import { GetActionCenterHandler } from "./application/queries/get-action-center.handler";
import { BRANCH_HEALTH_READER } from "./domain/ports/branch-health-reader.port";
import { BranchHealthReader } from "./infrastructure/persistence/branch-health-reader";
import { GetBranchHealthHandler } from "./application/queries/get-branch-health.handler";
import { SALES_OPS_READER } from "./domain/ports/sales-ops-reader.port";
import { SalesOpsReader } from "./infrastructure/persistence/sales-ops-reader";
import { GetSalesOpsReportsHandler } from "./application/queries/get-sales-ops-reports.handler";
import { INVENTORY_REPORTS_READER } from "./domain/ports/inventory-reports-reader.port";
import { InventoryReportsReader } from "./infrastructure/persistence/inventory-reports-reader";
import { GetInventoryReportsHandler } from "./application/queries/get-inventory-reports.handler";
import { PROCUREMENT_REPORTS_READER } from "./domain/ports/procurement-reports-reader.port";
import { ProcurementReportsReader } from "./infrastructure/persistence/procurement-reports-reader";
import { GetProcurementReportsHandler } from "./application/queries/get-procurement-reports.handler";
import { DELIVERY_CUSTOMER_REPORTS_READER } from "./domain/ports/delivery-customer-reports-reader.port";
import { DeliveryCustomerReportsReader } from "./infrastructure/persistence/delivery-customer-reports-reader";
import { GetDeliveryCustomerReportsHandler } from "./application/queries/get-delivery-customer-reports.handler";
import { ReportsController } from "./api/reports.controller";

@Module({
  imports: [IdentityAccessModule, PaymentControlModule, SettingsModule],
  controllers: [ReportsController],
  providers: [
    { provide: DASHBOARD_SUMMARY_READER, useClass: DashboardSummaryReader },
    GetDashboardSummaryHandler,
    { provide: FOOD_COST_READER, useClass: FoodCostReader },
    GetFoodCostReportHandler,
    { provide: ACTION_CENTER_READER, useClass: ActionCenterReader },
    GetActionCenterHandler,
    { provide: BRANCH_HEALTH_READER, useClass: BranchHealthReader },
    GetBranchHealthHandler,
    { provide: SALES_OPS_READER, useClass: SalesOpsReader },
    GetSalesOpsReportsHandler,
    { provide: INVENTORY_REPORTS_READER, useClass: InventoryReportsReader },
    GetInventoryReportsHandler,
    { provide: PROCUREMENT_REPORTS_READER, useClass: ProcurementReportsReader },
    GetProcurementReportsHandler,
    { provide: DELIVERY_CUSTOMER_REPORTS_READER, useClass: DeliveryCustomerReportsReader },
    GetDeliveryCustomerReportsHandler,
  ],
})
export class ReportingModule {}
