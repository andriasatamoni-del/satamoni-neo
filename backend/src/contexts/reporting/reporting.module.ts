import { Module, OnModuleInit } from "@nestjs/common";
import { PermissionRegistry } from "../../shared/permissions/permission-registry";
import { IdentityAccessModule } from "../identity-access/identity-access.module";
import { PaymentControlModule } from "../payment-control/payment-control.module";
import { SettingsModule } from "../settings/settings.module";
import { DASHBOARD_SUMMARY_READER } from "./domain/ports/dashboard-summary-reader.port";
import { KyselyDashboardSummaryReader } from "./infrastructure/persistence/kysely-dashboard-summary-reader";
import { GetDashboardSummaryHandler } from "./application/queries/get-dashboard-summary.handler";
import { FOOD_COST_READER } from "./domain/ports/food-cost-reader.port";
import { KyselyFoodCostReader } from "./infrastructure/persistence/kysely-food-cost-reader";
import { GetFoodCostReportHandler } from "./application/queries/get-food-cost-report.handler";
import { ACTION_CENTER_READER } from "./domain/ports/action-center-reader.port";
import { KyselyActionCenterReader } from "./infrastructure/persistence/kysely-action-center-reader";
import { GetActionCenterHandler } from "./application/queries/get-action-center.handler";
import { BRANCH_HEALTH_READER } from "./domain/ports/branch-health-reader.port";
import { KyselyBranchHealthReader } from "./infrastructure/persistence/kysely-branch-health-reader";
import { GetBranchHealthHandler } from "./application/queries/get-branch-health.handler";
import { ReportsController } from "./api/reports.controller";

@Module({
  imports: [IdentityAccessModule, PaymentControlModule, SettingsModule],
  controllers: [ReportsController],
  providers: [
    { provide: DASHBOARD_SUMMARY_READER, useClass: KyselyDashboardSummaryReader },
    GetDashboardSummaryHandler,
    { provide: FOOD_COST_READER, useClass: KyselyFoodCostReader },
    GetFoodCostReportHandler,
    { provide: ACTION_CENTER_READER, useClass: KyselyActionCenterReader },
    GetActionCenterHandler,
    { provide: BRANCH_HEALTH_READER, useClass: KyselyBranchHealthReader },
    GetBranchHealthHandler,
  ],
})
export class ReportingModule implements OnModuleInit {
  constructor(private readonly permissions: PermissionRegistry) {}

  onModuleInit(): void {
    this.permissions.registerGroup({
      group: "reports",
      groupLabel: "التقارير ولوحة التحكم",
      permissions: [
        { key: "reports.view", label: "رؤية لوحة التحكم والتقارير" },
        // مقارنة شاملة بين كل الفروع - نفس requireRole("admin", "accountant") في الريبو القديم بالظبط،
        // مفتاح صلاحية منفصل بدل reports.view العام عشان مدير الفرع (اللي عنده reports.view لفرعه بس)
        // ميشوفش بيانات فروع تانية
        { key: "reports.branch_health", label: "رؤية بطاقة صحة الفروع (مقارنة كل الفروع)" },
      ],
    });
    // نفس canSeeReports في الريبو القديم بالظبط: أدمن + محاسب + مدير فرع (مش كاشير/كول سنتر/سائق)
    this.permissions.setRoleDefaults("accountant", ["reports.view", "reports.branch_health"]);
    this.permissions.setRoleDefaults("branch_manager", ["reports.view"]);
  }
}
